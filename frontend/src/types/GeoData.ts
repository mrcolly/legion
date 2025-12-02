/**
 * Geographic location with latitude and longitude
 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
}

/**
 * A single geo-located data point (matches backend type)
 */
export interface GeoDataPoint {
  id: string;
  hash?: string;
  timestamp: string; // ISO date string from API
  location: GeoLocation;
  title: string;
  description?: string;
  url?: string;
  source: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  count: number;
  total?: number;
  lastUpdate: string | null;
  data: T;
}

/**
 * SSE data update event
 */
export interface DataUpdateEvent {
  type: 'data-updated';
  source: string;
  newDataCount: number;
  totalCount: number;
  newData: GeoDataPoint[];
  timestamp: string;
}

/**
 * Globe point data format for react-globe.gl
 */
export interface GlobePoint {
  lat: number;
  lng: number;
  size: number;
  color: string;
  label?: string;
  data: GeoDataPoint;
  isMovingObject?: boolean;
}

/**
 * Position for moving objects
 */
export interface Position {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp: string;
}

/**
 * Moving object (satellite, aircraft, ship, etc.)
 */
export interface MovingObject {
  id: string;
  name: string;
  type: 'satellite' | 'aircraft' | 'ship' | 'vehicle' | 'other';
  icon?: string;
  color?: string;
  velocity?: number;
  positions: Position[]; // Last N positions for trajectory
  metadata?: Record<string, unknown>;
}

/**
 * SSE moving object update event
 */
export interface MovingObjectEvent {
  type: 'moving-object';
  object: MovingObject;
  isNew: boolean;
}

/**
 * SSE moving object removed event
 */
export interface MovingObjectRemovedEvent {
  type: 'moving-object-removed';
  id: string;
}
