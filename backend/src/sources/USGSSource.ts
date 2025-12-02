import axios from 'axios';
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { createGeoDataPoint } from '../utils/hashUtils';

/**
 * USGS Earthquake data source
 * Fetches real-time earthquake data from the US Geological Survey
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 */

// =============================================================================
// Types
// =============================================================================

interface USGSFeature {
  type: 'Feature';
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    url: string;
    detail: string;
    felt: number | null;
    cdi: number | null;
    mmi: number | null;
    alert: string | null;
    status: string;
    tsunami: number;
    sig: number;
    net: string;
    code: string;
    ids: string;
    sources: string;
    types: string;
    nst: number | null;
    dmin: number | null;
    rms: number;
    gap: number | null;
    magType: string;
    type: string;
    title: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number, number]; // [longitude, latitude, depth]
  };
  id: string;
}

interface USGSResponse {
  type: 'FeatureCollection';
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
  features: USGSFeature[];
}

// =============================================================================
// USGS Source Implementation
// =============================================================================

export class USGSSource extends DataSourceService {
  private readonly feedUrl: string;

  constructor(config?: Partial<DataSourceConfig> & { feedType?: 'hour' | 'day' | 'week' | 'month' }) {
    super({
      name: 'USGS',
      enabled: true,
      refreshInterval: 60000, // 1 minute - USGS updates every minute
      maxResults: 100,
      ...config,
    });

    // Choose feed based on desired timespan
    const feedType = config?.feedType ?? 'hour';
    const feeds: Record<string, string> = {
      hour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
      day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
      month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson',
    };
    this.feedUrl = feeds[feedType];
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    try {
      this.logger.debug({ url: this.feedUrl }, 'Fetching USGS earthquake data...');

      const response = await axios.get<USGSResponse>(this.feedUrl, {
        timeout: 15000,
      });

      if (!response.data?.features) {
        this.logger.warn('No earthquake data in response');
        this.updateStats(true, 0);
        return [];
      }

      const earthquakes = response.data.features;
      this.logger.debug({ count: earthquakes.length }, 'Earthquakes received');

      // Transform to GeoDataPoints, streaming each one
      const points: GeoDataPoint[] = [];

      for (const quake of earthquakes) {
        const point = this.transformEarthquake(quake);
        if (point) {
          this.emitDataPoint(point);
          points.push(point);
        }
      }

      this.updateStats(true, points.length);
      this.logger.info({ count: points.length }, 'Successfully fetched earthquake data');

      return points;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({
          error: error.message,
          status: error.response?.status,
        }, 'USGS API error');
      } else {
        this.logger.error({ error }, 'Error fetching earthquake data');
      }
      this.updateStats(false);
      return [];
    }
  }

  private transformEarthquake(quake: USGSFeature): GeoDataPoint | null {
    const { properties, geometry, id } = quake;
    const [longitude, latitude, depth] = geometry.coordinates;

    // Validate coordinates
    if (
      latitude === undefined ||
      longitude === undefined ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return null;
    }

    const magnitude = properties.mag;
    const magnitudeStr = magnitude !== null ? `M${magnitude.toFixed(1)}` : 'Unknown';

    return createGeoDataPoint({
      id: `usgs-${id}`,
      timestamp: new Date(properties.time),
      location: {
        latitude,
        longitude,
        accuracy: 1000, // Earthquakes have pretty precise locations
      },
      title: `🌋 ${magnitudeStr} Earthquake - ${properties.place}`,
      description: this.createDescription(properties, depth),
      url: properties.url,
      source: this.getName(),
      category: 'earthquake',
      metadata: {
        magnitude,
        magnitudeType: properties.magType,
        depth,
        place: properties.place,
        tsunami: properties.tsunami === 1,
        alert: properties.alert,
        significance: properties.sig,
        felt: properties.felt,
        status: properties.status,
      },
    });
  }

  private createDescription(
    props: USGSFeature['properties'],
    depth: number
  ): string {
    const parts: string[] = [];

    if (props.mag !== null) {
      parts.push(`Magnitude: ${props.mag.toFixed(1)} ${props.magType}`);
    }

    parts.push(`Depth: ${depth.toFixed(1)} km`);

    if (props.tsunami === 1) {
      parts.push('⚠️ Tsunami warning');
    }

    if (props.alert) {
      parts.push(`Alert: ${props.alert.toUpperCase()}`);
    }

    if (props.felt) {
      parts.push(`Felt by ${props.felt} people`);
    }

    return parts.join(' | ');
  }
}
