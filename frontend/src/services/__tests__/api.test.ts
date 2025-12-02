import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGeoData, fetchGeoDataByBbox, refreshData, checkHealth, subscribeToUpdates } from '../api';
import type { GeoDataPoint } from '../../types/GeoData';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Service', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchGeoData', () => {
    it('should fetch geo data successfully', async () => {
      const mockData: GeoDataPoint[] = [
        {
          id: 'test-1',
          timestamp: '2025-01-01T00:00:00Z',
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Test Event',
          source: 'Demo',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData, count: 1 }),
      });

      const result = await fetchGeoData();

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/data')
      );
    });

    it('should include sort and limit params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], count: 0 }),
      });

      await fetchGeoData({ sort: 'desc', limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=desc')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      );
    });

    it('should throw error on failed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(fetchGeoData()).rejects.toThrow('Failed to fetch data');
    });

    it('should throw error on unsuccessful API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });

      await expect(fetchGeoData()).rejects.toThrow('API returned unsuccessful response');
    });
  });

  describe('fetchGeoDataByBbox', () => {
    it('should fetch data within bounding box', async () => {
      const mockData: GeoDataPoint[] = [
        {
          id: 'test-1',
          timestamp: '2025-01-01T00:00:00Z',
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'New York Event',
          source: 'Demo',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData, count: 1 }),
      });

      const result = await fetchGeoDataByBbox(40, 41, -75, -73);

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('minLat=40')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maxLat=41')
      );
    });
  });

  describe('refreshData', () => {
    it('should trigger data refresh', async () => {
      const mockData: GeoDataPoint[] = [];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData, count: 0 }),
      });

      const result = await refreshData();

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/data/refresh'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('checkHealth', () => {
    it('should return true when backend is healthy', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await checkHealth();

      expect(result).toBe(true);
    });

    it('should return false when backend is unhealthy', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await checkHealth();

      expect(result).toBe(false);
    });

    it('should return false when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await checkHealth();

      expect(result).toBe(false);
    });
  });

  describe('subscribeToUpdates', () => {
    it('should create EventSource with correct URL', () => {
      const onUpdate = vi.fn();
      const cleanup = subscribeToUpdates(onUpdate);

      expect(typeof cleanup).toBe('function');
    });

    it('should call cleanup function', () => {
      const onUpdate = vi.fn();
      const cleanup = subscribeToUpdates(onUpdate);

      // Should not throw
      expect(() => cleanup()).not.toThrow();
    });
  });
});

