/**
 * Core types for geolocation-based data
 * These are data-source agnostic and should work with any provider
 */

export interface GeoLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
}

export interface GeoDataPoint {
  id: string;
  hash: string; // Content-based hash for deduplication
  timestamp: Date;
  location: GeoLocation;
  title: string;
  description?: string;
  url?: string;
  source: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface DataSourceConfig {
  name: string;
  enabled: boolean;
  refreshInterval?: number; // milliseconds
  maxResults?: number;
  filters?: Record<string, any>;
}

export interface DataSourceStats {
  totalFetched: number;
  lastFetchTime?: Date;
  errors: number;
  isHealthy: boolean;
}
