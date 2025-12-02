/**
 * GeoParser - Extract and geocode locations from text
 * 
 * Uses NLP to extract place names and geocoding services to get coordinates.
 * Implements caching and rate limiting for efficiency.
 */

import nlp from 'compromise';
import NodeGeocoder, { Geocoder, Entry } from 'node-geocoder';
import { createLogger } from '../utils/logger';

const logger = createLogger({ component: 'GeoParser' });

// =============================================================================
// Types
// =============================================================================

export interface ParsedLocation {
  /** Original text that was identified as a location */
  text: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** Formatted address from geocoder */
  formattedAddress?: string;
  /** City name */
  city?: string;
  /** Country name */
  country?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

export interface GeoParserOptions {
  /** Geocoding provider (default: openstreetmap) */
  provider?: 'openstreetmap' | 'mapbox' | 'google';
  /** API key for paid providers */
  apiKey?: string;
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTTL?: number;
  /** Max locations to extract per text (default: 3) */
  maxLocations?: number;
  /** Min text length for location to be considered (default: 2) */
  minLocationLength?: number;
  /** Rate limit delay in ms (default: 1100 for Nominatim) */
  rateLimitDelay?: number;
}

interface CacheEntry {
  result: ParsedLocation | null;
  timestamp: number;
}

// =============================================================================
// GeoParser Class
// =============================================================================

export class GeoParser {
  private readonly geocoder: Geocoder;
  private readonly cache: Map<string, CacheEntry>;
  private readonly options: Required<GeoParserOptions>;
  private lastRequestTime: number = 0;
  private readonly pendingRequests: Map<string, Promise<ParsedLocation | null>> = new Map();
  
  // Global request queue to enforce rate limiting across all sources
  private readonly requestQueue: Array<() => void> = [];
  private isProcessingQueue: boolean = false;

  constructor(options: GeoParserOptions = {}) {
    this.options = {
      provider: options.provider ?? 'openstreetmap',
      apiKey: options.apiKey ?? '',
      cacheTTL: options.cacheTTL ?? 3600000, // 1 hour
      maxLocations: options.maxLocations ?? 3,
      minLocationLength: options.minLocationLength ?? 2,
      rateLimitDelay: options.rateLimitDelay ?? 1100, // Nominatim requires 1 req/sec
    };

    // Initialize geocoder based on provider
    if (this.options.provider === 'google' && this.options.apiKey) {
      this.geocoder = NodeGeocoder({
        provider: 'google',
        apiKey: this.options.apiKey,
      });
    } else if (this.options.provider === 'mapbox' && this.options.apiKey) {
      this.geocoder = NodeGeocoder({
        provider: 'mapbox',
        apiKey: this.options.apiKey,
      });
    } else {
      // Default to OpenStreetMap (free, no API key required)
      this.geocoder = NodeGeocoder({
        provider: 'openstreetmap',
      });
    }
    this.cache = new Map();

    logger.info({ provider: this.options.provider }, 'GeoParser initialized');
  }

  /**
   * Extract locations from text and geocode them
   */
  async parseLocations(text: string): Promise<ParsedLocation[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Extract place names using NLP
    const placeNames = this.extractPlaceNames(text);

    if (placeNames.length === 0) {
      return [];
    }

    logger.debug({ placeNames }, 'Extracted place names');

    // Geocode each place (limited by maxLocations)
    const locations: ParsedLocation[] = [];
    const toGeocode = placeNames.slice(0, this.options.maxLocations);

    for (const placeName of toGeocode) {
      const location = await this.geocodePlace(placeName);
      if (location) {
        locations.push(location);
      }
    }

    return locations;
  }

  /**
   * Extract the best (first valid) location from text
   */
  async parseBestLocation(text: string): Promise<ParsedLocation | null> {
    const locations = await this.parseLocations(text);
    return locations[0] ?? null;
  }

  /**
   * Extract place names from text using NLP
   */
  private extractPlaceNames(text: string): string[] {
    const doc = nlp(text);
    
    // Extract places (cities, countries, regions)
    const places = doc.places().out('array') as string[];
    
    // Also try to extract organizations that might be places
    // and proper nouns that could be locations
    const topics = doc.topics().out('array') as string[];
    
    // Combine and deduplicate
    const allPlaces = [...new Set([...places, ...topics])];
    
    // Filter out invalid entries
    return allPlaces
      .map(p => p.trim())
      .filter(p => p.length >= this.options.minLocationLength)
      .filter(p => !this.isCommonWord(p))
      .filter(p => !this.isInvalidPlaceName(p));
  }

  /**
   * Check if a string is not a valid place name
   */
  private isInvalidPlaceName(name: string): boolean {
    // Filter out hashtags
    if (name.startsWith('#')) return true;
    
    // Filter out @mentions
    if (name.startsWith('@')) return true;
    
    // Filter out URLs
    if (name.startsWith('http://') || name.startsWith('https://')) return true;
    
    // Filter out numbers only
    if (/^\d+$/.test(name)) return true;
    
    // Filter out strings with too many special characters
    const specialCharCount = (name.match(/[^a-zA-Z\s]/g) || []).length;
    if (specialCharCount > name.length * 0.3) return true;
    
    return false;
  }

  /**
   * Check if a word is too common to be a place name
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'today', 'yesterday', 'tomorrow', 'now', 'then', 'here', 'there',
      'news', 'breaking', 'update', 'live', 'watch', 'read', 'more', 'new',
      'says', 'said', 'reports', 'reported', 'announces', 'announced',
    ]);
    return commonWords.has(word.toLowerCase());
  }

  /**
   * Geocode a place name to coordinates
   */
  private async geocodePlace(placeName: string): Promise<ParsedLocation | null> {
    const cacheKey = placeName.toLowerCase().trim();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.options.cacheTTL) {
      logger.debug({ placeName, cached: true }, 'Cache hit');
      return cached.result;
    }

    // Check if request is already pending
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Create new request with rate limiting
    const requestPromise = this.doGeocode(placeName, cacheKey);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Perform the actual geocoding request with global rate limiting queue
   */
  private async doGeocode(placeName: string, cacheKey: string): Promise<ParsedLocation | null> {
    // Wait for our turn in the queue (global rate limiting)
    await this.waitForRateLimit();

    try {
      const results = await this.geocoder.geocode(placeName);
      
      if (!results || results.length === 0) {
        logger.debug({ placeName }, 'No geocoding results');
        this.cacheResult(cacheKey, null);
        return null;
      }

      const best = results[0];
      const location = this.transformResult(placeName, best);
      
      this.cacheResult(cacheKey, location);
      logger.debug({ placeName, location }, 'Geocoded successfully');
      
      return location;
    } catch (error) {
      logger.warn({ placeName, error }, 'Geocoding failed');
      this.cacheResult(cacheKey, null);
      return null;
    }
  }

  /**
   * Global rate limiting - ensures only 1 request per rateLimitDelay across all callers
   */
  private waitForRateLimit(): Promise<void> {
    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
      this.processQueue();
    });
  }

  /**
   * Process the rate limit queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.options.rateLimitDelay) {
        await this.sleep(this.options.rateLimitDelay - timeSinceLastRequest);
      }
      
      this.lastRequestTime = Date.now();
      const resolve = this.requestQueue.shift();
      if (resolve) {
        resolve();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Transform geocoder result to ParsedLocation
   */
  private transformResult(originalText: string, result: Entry): ParsedLocation {
    return {
      text: originalText,
      latitude: result.latitude!,
      longitude: result.longitude!,
      formattedAddress: result.formattedAddress,
      city: result.city,
      country: result.country,
      confidence: this.calculateConfidence(result),
    };
  }

  /**
   * Calculate confidence score based on result quality
   */
  private calculateConfidence(result: Entry): number {
    let confidence = 0.5; // Base confidence

    // Has city - more specific
    if (result.city) confidence += 0.2;
    
    // Has country - valid location
    if (result.country) confidence += 0.15;
    
    // Has street address - very specific
    if (result.streetName) confidence += 0.15;

    return Math.min(confidence, 1);
  }

  /**
   * Cache a geocoding result
   */
  private cacheResult(key: string, result: ParsedLocation | null): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number } {
    return {
      size: this.cache.size,
      hits: 0, // Would need to track this
    };
  }
}

// =============================================================================
// Singleton instance for shared use
// =============================================================================

let sharedInstance: GeoParser | null = null;

/**
 * Get the shared GeoParser instance
 */
export function getGeoParser(options?: GeoParserOptions): GeoParser {
  sharedInstance ??= new GeoParser(options);
  return sharedInstance;
}

/**
 * Reset the shared instance (useful for testing)
 */
export function resetGeoParser(): void {
  sharedInstance = null;
}
