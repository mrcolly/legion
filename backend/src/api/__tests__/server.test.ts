import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../server';
import { DataAggregator } from '../../services/DataAggregator';
import { DataSourceService } from '../../services/DataSourceService';
import { GeoDataPoint } from '../../types/GeoData';
import { createGeoDataPoint } from '../../utils/hashUtils';

// Mock data source
class MockDataSource extends DataSourceService {
  private readonly mockData: GeoDataPoint[] = [];

  constructor(data: Omit<GeoDataPoint, 'hash'>[] = []) {
    super({
      name: 'MockSource',
      enabled: true,
      refreshInterval: 1000,
    });
    this.mockData = data.map(d => createGeoDataPoint(d));
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    return this.mockData;
  }
}

describe('API Server', () => {
  let aggregator: DataAggregator;
  let app: Express.Application;

  beforeEach(async () => {
    aggregator = new DataAggregator();
    
    const mockData: Omit<GeoDataPoint, 'hash'>[] = [
      {
        id: 'test-1',
        timestamp: new Date('2025-01-01T12:00:00Z'),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'New York Event',
        url: 'https://example.com/ny',
        source: 'MockSource',
        category: 'test',
      },
      {
        id: 'test-2',
        timestamp: new Date('2025-01-01T13:00:00Z'),
        location: { latitude: 51.5074, longitude: -0.1278 },
        title: 'London Event',
        url: 'https://example.com/london',
        source: 'MockSource',
        category: 'test',
      },
      {
        id: 'test-3',
        timestamp: new Date('2025-01-01T14:00:00Z'),
        location: { latitude: 35.6762, longitude: 139.6503 },
        title: 'Tokyo Event',
        url: 'https://example.com/tokyo',
        source: 'MockSource',
        category: 'test',
      },
    ];

    const source = new MockDataSource(mockData);
    aggregator.registerSource(source);
    await aggregator.fetchAll();

    app = createServer(aggregator);
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/data', () => {
    it('should return all cached data', async () => {
      const response = await request(app).get('/api/data');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(3);
      expect(response.body.data).toHaveLength(3);
    });

    it('should sort data descending by default (newest first)', async () => {
      const response = await request(app).get('/api/data');

      expect(response.status).toBe(200);
      expect(response.body.data[0].title).toBe('Tokyo Event'); // Latest
      expect(response.body.data[2].title).toBe('New York Event'); // Earliest
    });

    it('should sort data ascending when specified', async () => {
      const response = await request(app).get('/api/data?sort=asc');

      expect(response.status).toBe(200);
      expect(response.body.data[0].title).toBe('New York Event'); // Earliest
      expect(response.body.data[2].title).toBe('Tokyo Event'); // Latest
    });

    it('should limit results when specified', async () => {
      const response = await request(app).get('/api/data?limit=2');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.data).toHaveLength(2);
    });

    it('should combine sort and limit', async () => {
      const response = await request(app).get('/api/data?sort=asc&limit=1');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].title).toBe('New York Event');
    });
  });

  describe('GET /api/data/bbox', () => {
    it('should filter by bounding box', async () => {
      // Bounding box around New York
      const response = await request(app).get('/api/data/bbox')
        .query({
          minLat: 40,
          maxLat: 41,
          minLon: -75,
          maxLon: -73,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].title).toBe('New York Event');
    });

    it('should return 400 if bbox parameters are missing', async () => {
      const response = await request(app).get('/api/data/bbox')
        .query({
          minLat: 40,
          maxLat: 41,
          // Missing minLon and maxLon
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should filter multiple locations in bbox', async () => {
      // Large bounding box covering Europe
      const response = await request(app).get('/api/data/bbox')
        .query({
          minLat: 35,
          maxLat: 60,
          minLon: -10,
          maxLon: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1); // Only London
      expect(response.body.data[0].title).toBe('London Event');
    });
  });

  describe('GET /api/sources', () => {
    it('should return source statistics', async () => {
      const response = await request(app).get('/api/sources');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sources).toHaveLength(1);
      expect(response.body.sources[0].name).toBe('MockSource');
      expect(response.body.sources[0].enabled).toBe(true);
    });
  });

  describe('GET /api/cache/stats', () => {
    it('should return cache statistics', async () => {
      const response = await request(app).get('/api/cache/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.totalPoints).toBe(3);
      expect(response.body.uniqueHashes).toBe(3);
      expect(response.body.lastUpdate).toBeDefined();
    });
  });

  describe('POST /api/cache/clear', () => {
    it('should clear the cache', async () => {
      // Verify cache has data
      let response = await request(app).get('/api/data');
      expect(response.body.count).toBe(3);

      // Clear cache
      response = await request(app).post('/api/cache/clear');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify cache is empty
      response = await request(app).get('/api/data');
      expect(response.body.count).toBe(0);
    });
  });

  describe('POST /api/data/refresh', () => {
    it('should refresh data from sources', async () => {
      const response = await request(app).post('/api/data/refresh');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.lastUpdate).toBeDefined();
    });
  });
});
