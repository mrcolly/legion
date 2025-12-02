import axios from 'axios';
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { createGeoDataPoint } from '../utils/hashUtils';

/**
 * EONET (Earth Observatory Natural Event Tracker) data source
 * Fetches natural disaster events from NASA
 * https://eonet.gsfc.nasa.gov/docs/v3
 */

// =============================================================================
// Types
// =============================================================================

interface EONETGeometry {
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  date: string;
  type: 'Point' | 'Polygon';
  coordinates: number[] | number[][];
}

interface EONETCategory {
  id: string;
  title: string;
}

interface EONETSource {
  id: string;
  url: string;
}

interface EONETEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null;
  categories: EONETCategory[];
  sources: EONETSource[];
  geometry: EONETGeometry[];
}

interface EONETResponse {
  title: string;
  description: string;
  link: string;
  events: EONETEvent[];
}

// Category icons for different event types
const CATEGORY_ICONS: Record<string, string> = {
  wildfires: '🔥',
  severeStorms: '🌪️',
  volcanoes: '🌋',
  earthquakes: '🌍',
  floods: '🌊',
  landslides: '⛰️',
  seaLakeIce: '🧊',
  snow: '❄️',
  tempExtremes: '🌡️',
  dustHaze: '💨',
  drought: '☀️',
  manmade: '⚠️',
  waterColor: '💧',
};

// =============================================================================
// EONET Source Implementation
// =============================================================================

export class EONETSource extends DataSourceService {
  private readonly baseUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events';

  constructor(config?: Partial<DataSourceConfig> & { 
    days?: number;
    status?: 'open' | 'closed' | 'all';
  }) {
    super({
      name: 'EONET',
      enabled: true,
      refreshInterval: 300000, // 5 minutes - EONET updates less frequently
      maxResults: 50,
      ...config,
    });
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    try {
      this.logger.debug('Fetching EONET natural disaster data...');

      // Get events from the last 30 days, only open events
      const params = {
        status: 'open',
        limit: this.config.maxResults,
        days: 30,
      };

      const response = await axios.get<EONETResponse>(this.baseUrl, {
        params,
        timeout: 15000,
      });

      if (!response.data?.events) {
        this.logger.warn('No EONET events in response');
        this.updateStats(true, 0);
        return [];
      }

      const events = response.data.events;
      this.logger.debug({ count: events.length }, 'EONET events received');

      // Transform to GeoDataPoints
      const points: GeoDataPoint[] = [];

      for (const event of events) {
        const eventPoints = this.transformEvent(event);
        for (const point of eventPoints) {
          this.emitDataPoint(point);
          points.push(point);
        }
      }

      this.updateStats(true, points.length);
      this.logger.info({ count: points.length }, 'Successfully fetched EONET data');

      return points;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({
          error: error.message,
          status: error.response?.status,
        }, 'EONET API error');
      } else {
        this.logger.error({ error }, 'Error fetching EONET data');
      }
      this.updateStats(false);
      return [];
    }
  }

  /**
   * Transform EONET event to GeoDataPoints
   * An event can have multiple geometries (locations over time)
   * We take the most recent geometry
   */
  private transformEvent(event: EONETEvent): GeoDataPoint[] {
    const points: GeoDataPoint[] = [];

    // Get the most recent geometry (last in array)
    const geometries = event.geometry;
    if (!geometries || geometries.length === 0) {
      return points;
    }

    // Use only the most recent geometry
    const latestGeometry = geometries[geometries.length - 1];
    const point = this.geometryToPoint(event, latestGeometry);
    if (point) {
      points.push(point);
    }

    return points;
  }

  private geometryToPoint(
    event: EONETEvent,
    geometry: EONETGeometry
  ): GeoDataPoint | null {
    let latitude: number;
    let longitude: number;

    if (geometry.type === 'Point') {
      // Point coordinates are [longitude, latitude]
      const coords = geometry.coordinates as number[];
      if (coords.length < 2) return null;
      [longitude, latitude] = coords;
    } else if (geometry.type === 'Polygon') {
      // Polygon - use centroid of first ring
      const rings = geometry.coordinates as number[][];
      if (!rings || rings.length === 0) return null;
      
      // Calculate centroid
      let sumLat = 0;
      let sumLng = 0;
      const firstRing = rings[0] as unknown as number[][];
      if (!firstRing || firstRing.length === 0) return null;
      
      for (const coord of firstRing) {
        sumLng += coord[0];
        sumLat += coord[1];
      }
      longitude = sumLng / firstRing.length;
      latitude = sumLat / firstRing.length;
    } else {
      return null;
    }

    // Validate coordinates
    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    const category = event.categories[0];
    const categoryId = category?.id || 'unknown';
    const icon = CATEGORY_ICONS[categoryId] || '🌍';

    return createGeoDataPoint({
      id: `eonet-${event.id}-${geometry.date}`,
      timestamp: new Date(geometry.date),
      location: {
        latitude,
        longitude,
        accuracy: 5000, // Natural events can be large areas
      },
      title: `${icon} ${event.title}`,
      description: this.createDescription(event, geometry),
      url: event.link,
      source: this.getName(),
      category: categoryId,
      metadata: {
        eventId: event.id,
        categoryId,
        categoryTitle: category?.title,
        closed: event.closed,
        magnitude: geometry.magnitudeValue,
        magnitudeUnit: geometry.magnitudeUnit,
        sources: event.sources.map(s => s.id),
      },
    });
  }

  private createDescription(
    event: EONETEvent,
    geometry: EONETGeometry
  ): string {
    const parts: string[] = [];

    const category = event.categories[0];
    if (category) {
      parts.push(`Type: ${category.title}`);
    }

    if (geometry.magnitudeValue !== null && geometry.magnitudeUnit) {
      parts.push(`Magnitude: ${geometry.magnitudeValue} ${geometry.magnitudeUnit}`);
    }

    if (event.description) {
      const desc = event.description.substring(0, 100);
      parts.push(desc + (event.description.length > 100 ? '...' : ''));
    }

    if (event.closed) {
      parts.push('Status: Closed');
    } else {
      parts.push('Status: Active');
    }

    return parts.join(' | ');
  }
}

