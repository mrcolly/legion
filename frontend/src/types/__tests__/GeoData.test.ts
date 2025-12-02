import { describe, it, expect } from 'vitest';
import type { GeoDataPoint, GeoLocation, GlobePoint, DataUpdateEvent, ApiResponse } from '../GeoData';

describe('GeoData Types', () => {
  describe('GeoLocation', () => {
    it('should accept valid coordinates', () => {
      const location: GeoLocation = {
        latitude: 40.7128,
        longitude: -74.006,
      };

      expect(location.latitude).toBe(40.7128);
      expect(location.longitude).toBe(-74.006);
    });
  });

  describe('GeoDataPoint', () => {
    it('should accept minimal required fields', () => {
      const point: GeoDataPoint = {
        id: 'test-1',
        timestamp: '2025-01-01T00:00:00Z',
        location: { latitude: 0, longitude: 0 },
        title: 'Test',
        source: 'Demo',
      };

      expect(point.id).toBe('test-1');
      expect(point.source).toBe('Demo');
    });

    it('should accept all optional fields', () => {
      const point: GeoDataPoint = {
        id: 'test-1',
        hash: 'abc123',
        timestamp: '2025-01-01T00:00:00Z',
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        description: 'Test description',
        url: 'https://example.com',
        source: 'GDELT',
        category: 'news',
        metadata: { key: 'value' },
      };

      expect(point.hash).toBe('abc123');
      expect(point.description).toBe('Test description');
      expect(point.url).toBe('https://example.com');
      expect(point.category).toBe('news');
      expect(point.metadata).toEqual({ key: 'value' });
    });
  });

  describe('GlobePoint', () => {
    it('should have correct structure for globe.gl', () => {
      const geoDataPoint: GeoDataPoint = {
        id: 'test-1',
        timestamp: '2025-01-01T00:00:00Z',
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test',
        source: 'Demo',
      };

      const globePoint: GlobePoint = {
        lat: 40.7128,
        lng: -74.006,
        size: 0.5,
        color: '#ff6b6b',
        label: 'Test',
        data: geoDataPoint,
      };

      expect(globePoint.lat).toBe(40.7128);
      expect(globePoint.lng).toBe(-74.006);
      expect(globePoint.data.id).toBe('test-1');
    });
  });

  describe('DataUpdateEvent', () => {
    it('should represent SSE update event', () => {
      const event: DataUpdateEvent = {
        type: 'data-updated',
        source: 'Demo',
        newDataCount: 5,
        totalCount: 100,
        newData: [],
        timestamp: '2025-01-01T00:00:00Z',
      };

      expect(event.type).toBe('data-updated');
      expect(event.newDataCount).toBe(5);
    });
  });

  describe('ApiResponse', () => {
    it('should wrap data with metadata', () => {
      const response: ApiResponse<GeoDataPoint[]> = {
        success: true,
        count: 10,
        total: 100,
        lastUpdate: '2025-01-01T00:00:00Z',
        data: [],
      };

      expect(response.success).toBe(true);
      expect(response.count).toBe(10);
    });
  });
});

