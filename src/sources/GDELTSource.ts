import axios from 'axios';
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { COUNTRY_COORDINATES } from '../constants/countryCoordinates';
import { createGeoDataPoint } from '../utils/hashUtils';

/**
 * GDELT Project data source
 * Fetches real-time global news events with geolocation
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

export class GDELTSource extends DataSourceService {
  private readonly baseUrl = 'https://api.gdeltproject.org/api/v2/doc/doc';
  
  constructor(config?: Partial<DataSourceConfig>) {
    super({
      name: 'GDELT',
      enabled: true,
      refreshInterval: 60000, // 1 minute
      maxResults: 250,
      ...config,
    });
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

      // Transform GDELT data to our generic format
      // Accept articles with either precise coordinates OR a known source country
      const articlesWithGeo = response.data.articles.filter((article) => {
        // Check for precise coordinates
        const hasLat = article.lat !== undefined && article.lat !== null;
        const hasLon = article.lon !== undefined && article.lon !== null;
        const validLat = hasLat && !Number.isNaN(article.lat!) && article.lat! >= -90 && article.lat! <= 90;
        const validLon = hasLon && !Number.isNaN(article.lon!) && article.lon! >= -180 && article.lon! <= 180;
        const hasPreciseCoords = validLat && validLon;

        // Check for fallback to country coordinates
        const hasCountryFallback = article.sourcecountry && COUNTRY_COORDINATES[article.sourcecountry];

        return hasPreciseCoords || hasCountryFallback;
      });

      console.log(`[${this.getName()}] Articles with geo data (precise or country fallback): ${articlesWithGeo.length}`);
      
      // Log breakdown of precise vs fallback
      const preciseCount = articlesWithGeo.filter(a => a.lat && a.lon).length;
      const fallbackCount = articlesWithGeo.length - preciseCount;
      console.log(`[${this.getName()}] - Precise coordinates: ${preciseCount}`);
      console.log(`[${this.getName()}] - Country fallback: ${fallbackCount}`);

      if (articlesWithGeo.length === 0) {
        console.warn(`[${this.getName()}] No articles have geographic data. This is normal during quiet news periods.`);
        console.warn(`[${this.getName()}] Tip: Try using the Demo source for testing, or wait for the next refresh cycle.`);
      }

      const geoDataPoints: GeoDataPoint[] = articlesWithGeo.map((article, index) =>
        this.transformArticle(article, index)
      );

      this.updateStats(true, geoDataPoints.length);
      this.logger.info({ count: geoDataPoints.length }, 'Successfully fetched geo-located data points');

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
   * Uses precise coordinates if available, otherwise falls back to country capital
   */
  private transformArticle(article: GDELTEvent, index: number): GeoDataPoint {
    // Determine coordinates - use precise if available, otherwise country fallback
    let latitude: number;
    let longitude: number;
    let isPrecise = false;

    if (article.lat && article.lon && 
        !Number.isNaN(article.lat) && !Number.isNaN(article.lon)) {
      // Use precise coordinates
      latitude = article.lat;
      longitude = article.lon;
      isPrecise = true;
    } else if (article.sourcecountry && COUNTRY_COORDINATES[article.sourcecountry]) {
      // Fallback to country capital
      const countryData = COUNTRY_COORDINATES[article.sourcecountry];
      latitude = countryData.lat;
      longitude = countryData.lon;
      // isPrecise remains false (set at initialization)
    } else {
      // This shouldn't happen due to filtering, but provide a safe default
      latitude = 0;
      longitude = 0;
      // isPrecise remains false
    }

    return createGeoDataPoint({
      id: `gdelt-${article.url}-${article.seendate}`,
      timestamp: this.parseGDELTDate(article.seendate),
      location: {
        latitude,
        longitude,
        accuracy: isPrecise ? undefined : 50000, // ~50km radius for country-level
      },
      title: article.title,
      description: isPrecise 
        ? `Source: ${article.domain} | Country: ${article.sourcecountry}`
        : `Source: ${article.domain} | Country: ${article.sourcecountry} (${COUNTRY_COORDINATES[article.sourcecountry]?.city || 'capital'})`,
      url: article.url,
      source: this.getName(),
      category: 'news',
      metadata: {
        domain: article.domain,
        language: article.language,
        sourceCountry: article.sourcecountry,
        socialImage: article.socialimage,
        seenDate: article.seendate,
        geoType: isPrecise ? 'precise' : 'country-fallback',
        ...(isPrecise ? {} : { 
          fallbackCity: COUNTRY_COORDINATES[article.sourcecountry]?.city 
        }),
      },
    });
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
}
