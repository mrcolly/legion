import Parser from 'rss-parser';
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { createGeoDataPoint } from '../utils/hashUtils';
import { GeoParser, getGeoParser, ParsedLocation } from '../services/GeoParser';

/**
 * RSS Feed data source
 * Fetches news from popular RSS feeds around the world
 * Supports optional geoparsing for precise locations from article content
 */

// =============================================================================
// Types
// =============================================================================

interface FeedConfig {
  url: string;
  name: string;
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  category?: string;
  language?: string;
}

interface FeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  categories?: string[];
  guid?: string;
}

interface RSSSourceConfig extends Partial<DataSourceConfig> {
  feeds?: FeedConfig[];
  itemsPerFeed?: number;
  /** Enable geoparsing to extract precise locations from text */
  enableGeoparsing?: boolean;
}

// =============================================================================
// Popular RSS Feeds from around the world
// =============================================================================

const POPULAR_FEEDS: FeedConfig[] = [
  // === North America ===
  {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    name: 'New York Times',
    location: { city: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.006 },
    category: 'news',
    language: 'en',
  },
  {
    url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    name: 'BBC World',
    location: { city: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
    category: 'news',
    language: 'en',
  },
  {
    url: 'https://www.cbc.ca/webfeed/rss/rss-world',
    name: 'CBC News',
    location: { city: 'Toronto', country: 'Canada', latitude: 43.6532, longitude: -79.3832 },
    category: 'news',
    language: 'en',
  },
  {
    url: 'https://feeds.npr.org/1001/rss.xml',
    name: 'NPR News',
    location: { city: 'Washington DC', country: 'United States', latitude: 38.9072, longitude: -77.0369 },
    category: 'news',
    language: 'en',
  },
  
  // === Europe ===
  {
    url: 'https://www.theguardian.com/world/rss',
    name: 'The Guardian',
    location: { city: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
    category: 'news',
    language: 'en',
  },
  {
    url: 'https://www.spiegel.de/international/index.rss',
    name: 'Der Spiegel',
    location: { city: 'Hamburg', country: 'Germany', latitude: 53.5511, longitude: 9.9937 },
    category: 'news',
    language: 'de',
  },
  {
    url: 'https://www.lemonde.fr/rss/une.xml',
    name: 'Le Monde',
    location: { city: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522 },
    category: 'news',
    language: 'fr',
  },
  {
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada',
    name: 'El País',
    location: { city: 'Madrid', country: 'Spain', latitude: 40.4168, longitude: -3.7038 },
    category: 'news',
    language: 'es',
  },
  {
    url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml',
    name: 'La Repubblica',
    location: { city: 'Rome', country: 'Italy', latitude: 41.9028, longitude: 12.4964 },
    category: 'news',
    language: 'it',
  },
  
  // === Asia ===
  {
    url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
    name: 'NHK World',
    location: { city: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503 },
    category: 'news',
    language: 'ja',
  },
  {
    url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    name: 'Times of India',
    location: { city: 'Mumbai', country: 'India', latitude: 19.076, longitude: 72.8777 },
    category: 'news',
    language: 'en',
  },
  {
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    name: 'Al Jazeera',
    location: { city: 'Doha', country: 'Qatar', latitude: 25.2854, longitude: 51.531 },
    category: 'news',
    language: 'en',
  },
  {
    url: 'https://www.scmp.com/rss/91/feed',
    name: 'South China Morning Post',
    location: { city: 'Hong Kong', country: 'China', latitude: 22.3193, longitude: 114.1694 },
    category: 'news',
    language: 'en',
  },
  
  // === Oceania ===
  {
    url: 'https://www.abc.net.au/news/feed/2942460/rss.xml',
    name: 'ABC Australia',
    location: { city: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093 },
    category: 'news',
    language: 'en',
  },
  
  // === South America ===
  {
    url: 'https://rss.uol.com.br/feed/noticias.xml',
    name: 'UOL Notícias',
    location: { city: 'São Paulo', country: 'Brazil', latitude: -23.5505, longitude: -46.6333 },
    category: 'news',
    language: 'pt',
  },
  
  // === Africa ===
  {
    url: 'https://www.news24.com/news24/TopStories/rss',
    name: 'News24',
    location: { city: 'Cape Town', country: 'South Africa', latitude: -33.9249, longitude: 18.4241 },
    category: 'news',
    language: 'en',
  },
  
  // === Technology ===
  {
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    name: 'Ars Technica',
    location: { city: 'San Francisco', country: 'United States', latitude: 37.7749, longitude: -122.4194 },
    category: 'tech',
    language: 'en',
  },
  {
    url: 'https://www.wired.com/feed/rss',
    name: 'Wired',
    location: { city: 'San Francisco', country: 'United States', latitude: 37.7749, longitude: -122.4194 },
    category: 'tech',
    language: 'en',
  },
  {
    url: 'https://techcrunch.com/feed/',
    name: 'TechCrunch',
    location: { city: 'San Francisco', country: 'United States', latitude: 37.7749, longitude: -122.4194 },
    category: 'tech',
    language: 'en',
  },
];

// =============================================================================
// RSS Source Implementation
// =============================================================================

export class RSSSource extends DataSourceService {
  private parser: Parser;
  private feeds: FeedConfig[];
  private itemsPerFeed: number;
  private enableGeoparsing: boolean;
  private geoParser: GeoParser | null = null;

  constructor(config?: RSSSourceConfig) {
    super({
      name: 'RSS',
      enabled: true,
      refreshInterval: 300000, // 5 minutes (RSS feeds don't update as fast)
      maxResults: 100,
      ...config,
    });

    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Legion-RSS-Reader/1.0',
      },
    });

    this.feeds = config?.feeds ?? POPULAR_FEEDS;
    this.itemsPerFeed = config?.itemsPerFeed ?? 5;
    this.enableGeoparsing = config?.enableGeoparsing ?? true; // Enabled by default

    if (this.enableGeoparsing) {
      this.geoParser = getGeoParser();
      this.logger.debug('Geoparsing enabled');
    }
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    this.logger.debug({ feedCount: this.feeds.length }, 'Fetching RSS feeds...');

    const allPoints: GeoDataPoint[] = [];
    const results = await Promise.allSettled(
      this.feeds.map((feed) => this.fetchFeed(feed))
    );

    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPoints.push(...result.value);
        successCount++;
      } else {
        errorCount++;
        this.logger.debug({ error: result.reason }, 'Feed fetch failed');
      }
    }

    this.logger.info(
      { 
        totalPoints: allPoints.length, 
        feedsSuccess: successCount, 
        feedsError: errorCount 
      },
      'RSS fetch complete'
    );

    this.updateStats(true, allPoints.length);
    return allPoints;
  }

  private async fetchFeed(feed: FeedConfig): Promise<GeoDataPoint[]> {
    try {
      const parsed = await this.parser.parseURL(feed.url);
      const items = parsed.items.slice(0, this.itemsPerFeed);

      const points: GeoDataPoint[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (!item.title) continue;

        const point = await this.transformItem(
          item as FeedItem & { title: string },
          feed,
          index
        );
        points.push(point);
      }

      return points;
    } catch (error) {
      this.logger.warn({ feed: feed.name, error }, 'Failed to fetch feed');
      return [];
    }
  }

  private async transformItem(
    item: FeedItem & { title: string },
    feed: FeedConfig,
    index: number
  ): Promise<GeoDataPoint> {
    // Try to extract precise location from text if geoparsing is enabled
    let location = {
      latitude: feed.location.latitude,
      longitude: feed.location.longitude,
      accuracy: 10000, // ~10km radius for city-level (fallback)
    };
    let geoType = 'feed-default';
    let parsedLocation: ParsedLocation | null = null;

    if (this.geoParser) {
      // Combine title and content for better location extraction
      const textToAnalyze = [item.title, item.contentSnippet].filter(Boolean).join(' ');
      parsedLocation = await this.geoParser.parseBestLocation(textToAnalyze);

      if (parsedLocation && parsedLocation.confidence >= 0.5) {
        location = {
          latitude: parsedLocation.latitude,
          longitude: parsedLocation.longitude,
          accuracy: parsedLocation.confidence >= 0.8 ? 1000 : 5000, // Better confidence = better accuracy
        };
        geoType = 'geoparsed';
        this.logger.debug(
          { title: item.title, location: parsedLocation.text },
          'Extracted location from text'
        );
      }
    }

    // Add small offset if using feed default location (to spread points)
    if (geoType === 'feed-default') {
      const offset = this.getLocationOffset(index);
      location.latitude += offset.lat;
      location.longitude += offset.lng;
    }

    return createGeoDataPoint({
      id: `rss-${feed.name}-${item.guid || item.link || item.title}`,
      timestamp: item.isoDate ? new Date(item.isoDate) : new Date(),
      location,
      title: item.title,
      description: this.createDescription(item, feed, parsedLocation),
      url: item.link,
      source: this.getName(),
      category: feed.category || 'news',
      metadata: {
        feedName: feed.name,
        feedUrl: feed.url,
        city: parsedLocation?.city || feed.location.city,
        country: parsedLocation?.country || feed.location.country,
        language: feed.language,
        author: item.creator,
        categories: item.categories,
        geoType,
        ...(parsedLocation && {
          parsedLocation: parsedLocation.text,
          geoConfidence: parsedLocation.confidence,
        }),
      },
    });
  }

  private createDescription(
    item: FeedItem,
    feed: FeedConfig,
    parsedLocation: ParsedLocation | null
  ): string {
    const parts: string[] = [];
    
    parts.push(`📰 ${feed.name}`);
    
    if (parsedLocation) {
      parts.push(`📍 ${parsedLocation.formattedAddress || parsedLocation.text}`);
    } else {
      parts.push(`📍 ${feed.location.city}, ${feed.location.country}`);
    }
    
    if (item.contentSnippet) {
      const snippet = item.contentSnippet.substring(0, 150);
      parts.push(snippet + (item.contentSnippet.length > 150 ? '...' : ''));
    }
    
    return parts.join(' | ');
  }

  /**
   * Generate small offset to spread points from same location
   */
  private getLocationOffset(index: number): { lat: number; lng: number } {
    // Spiral pattern for even distribution
    const angle = (index * 137.5 * Math.PI) / 180;
    const radius = 0.05 * Math.sqrt(index + 1); // ~5km spread
    
    return {
      lat: radius * Math.sin(angle),
      lng: radius * Math.cos(angle),
    };
  }

  /**
   * Get list of configured feeds
   */
  getFeeds(): FeedConfig[] {
    return [...this.feeds];
  }

  /**
   * Add a custom feed
   */
  addFeed(feed: FeedConfig): void {
    this.feeds.push(feed);
    this.logger.info({ feed: feed.name }, 'Added custom feed');
  }

  /**
   * Check if geoparsing is enabled
   */
  isGeoparsingEnabled(): boolean {
    return this.enableGeoparsing;
  }
}

// Export feed config type for external use
export type { FeedConfig };
