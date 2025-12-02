import crypto from 'crypto';
import { GeoDataPoint } from '../types/GeoData';

/**
 * Generate a content-based hash for a GeoDataPoint
 * Uses key properties to create a unique identifier
 */
export function generateHash(dataPoint: Omit<GeoDataPoint, 'hash'>): string {
  // Create a stable string representation of key properties
  const hashContent = JSON.stringify({
    source: dataPoint.source,
    title: dataPoint.title,
    url: dataPoint.url,
    lat: dataPoint.location.latitude.toFixed(4), // Round to avoid floating point issues
    lon: dataPoint.location.longitude.toFixed(4),
    // Note: We don't include timestamp to detect same event reported at different times
  });

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(hashContent).digest('hex');
}

/**
 * Generate hash from minimal data (for quick lookups)
 */
export function generateQuickHash(source: string, title: string, url?: string): string {
  const hashContent = JSON.stringify({ source, title, url });
  return crypto.createHash('sha256').update(hashContent).digest('hex');
}

/**
 * Create a GeoDataPoint with auto-generated hash
 */
export function createGeoDataPoint(
  data: Omit<GeoDataPoint, 'hash'>
): GeoDataPoint {
  return {
    ...data,
    hash: generateHash(data),
  };
}
