import axios from 'axios';
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { COUNTRY_COORDINATES } from '../constants/countryCoordinates';
import { createGeoDataPoint } from '../utils/hashUtils';
import { GeoParser, getGeoParser, ParsedLocation } from '../services/GeoParser';

/**
 * GDELT Project data source
 * Fetches real-time global news events with geolocation
 * Supports optional geoparsing for more precise locations from article titles
 */

interface GDELTEvent {
  title: string;
  url: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
  lat?: number;
  lon?: number;
}

interface GDELTResponse {
  articles: GDELTEvent[];
}

interface GDELTSourceConfig extends Partial<DataSourceConfig> {
  /** Enable geoparsing to extract precise locations from article titles */
  enableGeoparsing?: boolean;
}

export class GDELTSource extends DataSourceService {
  private readonly baseUrl = 'https://api.gdeltproject.org/api/v2/doc/doc';
  private enableGeoparsing: boolean;
  private geoParser: GeoParser | null = null;
  
  constructor(config?: GDELTSourceConfig) {
    super({
      name: 'GDELT',
      enabled: true,
      refreshInterval: 60000, // 1 minute
      maxResults: 250,
      ...config,
    });

    this.enableGeoparsing = config?.enableGeoparsing ?? true; // Enabled by default

    if (this.enableGeoparsing) {
      this.geoParser = getGeoParser();
      this.logger.debug('Geoparsing enabled');
    }
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    try {
      this.logger.debug('Fetching data...');

      // GDELT Doc API with broader query to get recent news
      // We'll fetch recent articles and filter for those with geo data
      const params = {
        query: '(conflict OR summit OR election OR protest OR disaster OR weather OR sports)', // Topics likely to have location
        mode: 'ArtList',
        format: 'json',
        maxrecords: this.config.maxResults || 250,
        sort: 'DateDesc',
        timespan: '1h', // Last hour only
      };

      this.logger.debug({ query: params.query }, 'Query');

      const response = await axios.get<GDELTResponse>(this.baseUrl, {
        params,
        timeout: 15000,
      });

      this.logger.debug({ status: response.status }, 'API Response');

      if (!response.data) {
        this.logger.warn('Empty response from API');
        this.updateStats(true, 0);
        return [];
      }

      if (!response.data.articles || response.data.articles.length === 0) {
        this.logger.warn('No articles in response');
        this.updateStats(true, 0);
        return [];
      }

      this.logger.debug({ articleCount: response.data.articles.length }, 'Total articles received');

      // When geoparsing is enabled, process all articles
      // Otherwise, filter to those with existing geo data
      let articlesToProcess: GDELTEvent[];

      if (this.geoParser) {
        // With geoparsing, we can try to extract location from any article
        articlesToProcess = response.data.articles;
        this.logger.debug('Processing all articles with geoparsing');
      } else {
        // Without geoparsing, filter to articles with existing geo data
        articlesToProcess = response.data.articles.filter((article) => {
          const hasLat = article.lat !== undefined && article.lat !== null;
          const hasLon = article.lon !== undefined && article.lon !== null;
          const validLat = hasLat && !Number.isNaN(article.lat!) && article.lat! >= -90 && article.lat! <= 90;
          const validLon = hasLon && !Number.isNaN(article.lon!) && article.lon! >= -180 && article.lon! <= 180;
          const hasPreciseCoords = validLat && validLon;
          const hasCountryFallback = article.sourcecountry && COUNTRY_COORDINATES[article.sourcecountry];
          return hasPreciseCoords || hasCountryFallback;
        });
      }

      this.logger.debug({ count: articlesToProcess.length }, 'Articles to process');

      // Transform articles to GeoDataPoints
      const geoDataPoints: GeoDataPoint[] = [];
      
      for (let i = 0; i < articlesToProcess.length; i++) {
        const article = articlesToProcess[i];
        const point = await this.transformArticle(article, i);
        
        // Skip articles we couldn't geolocate
        if (point) {
          geoDataPoints.push(point);
        }
      }

      // Log breakdown
      const preciseCount = geoDataPoints.filter(p => p.metadata?.geoType === 'precise').length;
      const geoparsedCount = geoDataPoints.filter(p => p.metadata?.geoType === 'geoparsed').length;
      const fallbackCount = geoDataPoints.filter(p => p.metadata?.geoType === 'country-fallback').length;

      this.logger.info({
        total: geoDataPoints.length,
        precise: preciseCount,
        geoparsed: geoparsedCount,
        fallback: fallbackCount,
      }, 'Geo data breakdown');

      if (geoDataPoints.length === 0) {
        this.logger.warn('No articles have geographic data');
      }

      this.updateStats(true, geoDataPoints.length);
      return geoDataPoints;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({
          error: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
        }, 'Axios error');
      } else {
        this.logger.error({ error }, 'Error fetching data');
      }
      this.updateStats(false);
      return [];
    }
  }

  /**
   * Transform GDELT article to our generic GeoDataPoint format
   * Priority: 1. Precise GDELT coords, 2. Geoparsed from title, 3. Country fallback
   */
  private async transformArticle(article: GDELTEvent, index: number): Promise<GeoDataPoint | null> {
    let latitude: number;
    let longitude: number;
    let geoType: 'precise' | 'geoparsed' | 'country-fallback';
    let accuracy: number | undefined;
    let parsedLocation: ParsedLocation | null = null;

    // Check for precise GDELT coordinates first
    const hasValidPreciseCoords = 
      article.lat !== undefined && 
      article.lon !== undefined &&
      !Number.isNaN(article.lat) && 
      !Number.isNaN(article.lon) &&
      article.lat >= -90 && article.lat <= 90 &&
      article.lon >= -180 && article.lon <= 180;

    if (hasValidPreciseCoords) {
      // Use precise GDELT coordinates
      latitude = article.lat!;
      longitude = article.lon!;
      geoType = 'precise';
    } else if (this.geoParser) {
      // Try geoparsing from title
      parsedLocation = await this.geoParser.parseBestLocation(article.title);

      if (parsedLocation && parsedLocation.confidence >= 0.5) {
        latitude = parsedLocation.latitude;
        longitude = parsedLocation.longitude;
        geoType = 'geoparsed';
        accuracy = parsedLocation.confidence >= 0.8 ? 1000 : 5000;
        
        this.logger.debug({
          title: article.title.substring(0, 50),
          location: parsedLocation.text,
          confidence: parsedLocation.confidence,
        }, 'Extracted location from title');
      } else if (article.sourcecountry && COUNTRY_COORDINATES[article.sourcecountry]) {
        // Fallback to country
        const countryData = COUNTRY_COORDINATES[article.sourcecountry];
        latitude = countryData.lat;
        longitude = countryData.lon;
        geoType = 'country-fallback';
        accuracy = 50000;
      } else {
        // Can't determine location, skip this article
        this.logger.debug({ title: article.title.substring(0, 50) }, 'Could not determine location');
        return null;
      }
    } else if (article.sourcecountry && COUNTRY_COORDINATES[article.sourcecountry]) {
      // Fallback to country capital
      const countryData = COUNTRY_COORDINATES[article.sourcecountry];
      latitude = countryData.lat;
      longitude = countryData.lon;
      geoType = 'country-fallback';
      accuracy = 50000;
    } else {
      // No location data available
      return null;
    }

    return createGeoDataPoint({
      id: `gdelt-${article.url}-${article.seendate}`,
      timestamp: this.parseGDELTDate(article.seendate),
      location: {
        latitude,
        longitude,
        accuracy,
      },
      title: article.title,
      description: this.createDescription(article, geoType, parsedLocation),
      url: article.url,
      source: this.getName(),
      category: 'news',
      metadata: {
        domain: article.domain,
        language: article.language,
        sourceCountry: article.sourcecountry,
        socialImage: article.socialimage,
        seenDate: article.seendate,
        geoType,
        ...(geoType === 'country-fallback' && {
          fallbackCity: COUNTRY_COORDINATES[article.sourcecountry]?.city,
        }),
        ...(parsedLocation && {
          parsedLocation: parsedLocation.text,
          geoConfidence: parsedLocation.confidence,
        }),
      },
    });
  }

  /**
   * Create description based on geo type
   */
  private createDescription(
    article: GDELTEvent,
    geoType: string,
    parsedLocation: ParsedLocation | null
  ): string {
    const parts = [`Source: ${article.domain}`];

    if (geoType === 'geoparsed' && parsedLocation) {
      parts.push(`📍 ${parsedLocation.formattedAddress || parsedLocation.text}`);
    } else if (geoType === 'country-fallback') {
      const fallbackCity = COUNTRY_COORDINATES[article.sourcecountry]?.city || 'capital';
      parts.push(`Country: ${article.sourcecountry} (${fallbackCity})`);
    } else {
      parts.push(`Country: ${article.sourcecountry}`);
    }

    return parts.join(' | ');
  }

  /**
   * Parse GDELT date format (YYYYMMDDTHHmmssZ)
   */
  private parseGDELTDate(dateStr: string): Date {
    try {
      // Format: 20231201T123045Z -> 2023-12-01T12:30:45Z
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const hour = dateStr.substring(9, 11);
      const minute = dateStr.substring(11, 13);
      const second = dateStr.substring(13, 15);
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    } catch (error) {
      this.logger.warn({ dateStr, error }, 'Failed to parse date');
      return new Date();
    }
  }

  /**
   * Check if geoparsing is enabled
   */
  isGeoparsingEnabled(): boolean {
    return this.enableGeoparsing;
  }
}
