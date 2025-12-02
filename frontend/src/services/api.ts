import type { ApiResponse, GeoDataPoint, DataUpdateEvent } from '../types/GeoData';
import { apiLogger, sseLogger } from '../utils/logger';

// Use empty string for production (nginx proxies /api/* to backend)
// Fall back to localhost:3000 for local development
const API_BASE_URL = import.meta.env.VITE_API_URL !== undefined 
  ? import.meta.env.VITE_API_URL 
  : 'http://localhost:3000';

apiLogger.debug({ apiUrl: API_BASE_URL }, 'API client initialized');

/**
 * Fetch all geo data points from the backend
 */
export async function fetchGeoData(options?: {
  sort?: 'asc' | 'desc';
  limit?: number;
}): Promise<GeoDataPoint[]> {
  const params = new URLSearchParams();
  
  if (options?.sort) {
    params.set('sort', options.sort);
  }
  if (options?.limit) {
    params.set('limit', options.limit.toString());
  }

  const url = `${API_BASE_URL}/api/data${params.toString() ? `?${params}` : ''}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }

  const result: ApiResponse<GeoDataPoint[]> = await response.json();
  
  if (!result.success) {
    throw new Error('API returned unsuccessful response');
  }

  return result.data;
}

/**
 * Fetch geo data within a bounding box
 */
export async function fetchGeoDataByBbox(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number
): Promise<GeoDataPoint[]> {
  const params = new URLSearchParams({
    minLat: minLat.toString(),
    maxLat: maxLat.toString(),
    minLon: minLon.toString(),
    maxLon: maxLon.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/api/data/bbox?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch bbox data: ${response.statusText}`);
  }

  const result: ApiResponse<GeoDataPoint[]> = await response.json();
  return result.data;
}

/**
 * Trigger a data refresh on the backend
 */
export async function refreshData(): Promise<GeoDataPoint[]> {
  const response = await fetch(`${API_BASE_URL}/api/data/refresh`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh data: ${response.statusText}`);
  }

  const result: ApiResponse<GeoDataPoint[]> = await response.json();
  return result.data;
}

/**
 * Subscribe to real-time data updates via Server-Sent Events
 */
export function subscribeToUpdates(
  onUpdate: (event: DataUpdateEvent) => void,
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE_URL}/api/stream`);

  sseLogger.info('SSE connection established');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as DataUpdateEvent;
      sseLogger.debug({ type: data.type, newCount: data.newDataCount }, 'SSE message received');
      onUpdate(data);
    } catch (error) {
      sseLogger.error({ error }, 'Failed to parse SSE message');
    }
  };

  eventSource.onerror = (error) => {
    sseLogger.error({ error }, 'SSE connection error');
    onError?.(error);
  };

  // Return cleanup function
  return () => {
    sseLogger.info('SSE connection closed');
    eventSource.close();
  };
}

/**
 * Check backend health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
