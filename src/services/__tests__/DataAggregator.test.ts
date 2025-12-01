import { describe, it, expect, beforeEach } from 'vitest';
import { DataAggregator } from '../DataAggregator';
import { DataSourceService } from '../DataSourceService';
import { GeoDataPoint } from '../../types/GeoData';
import { createGeoDataPoint } from '../../utils/hashUtils';

// Mock data source for testing
class MockDataSource extends DataSourceService {
  private mockData: GeoDataPoint[] = [];

  constructor(name: string, data: Omit<GeoDataPoint, 'hash'>[] = []) {
    super({
      name,
      enabled: true,
      refreshInterval: 1000,
    });
    // Create data points with hashes - store them to ensure hashes are consistent
    this.mockData = data.map(d => createGeoDataPoint(d));
  }

  setMockData(data: Omit<GeoDataPoint, 'hash'>[]) {
    this.mockData = data.map(d => createGeoDataPoint(d));
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    // Return the same array reference to ensure hashes are identical
    return [...this.mockData];
  }
}

describe('DataAggregator', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    aggregator = new DataAggregator();
  });

  describe('source registration', () => {
    it('should register a data source', () => {
      const source = new MockDataSource('TestSource');
      aggregator.registerSource(source);

      const stats = aggregator.getSourceStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].name).toBe('TestSource');
    });

    it('should not register duplicate sources', () => {
      const source1 = new MockDataSource('TestSource');
      const source2 = new MockDataSource('TestSource');

      aggregator.registerSource(source1);
      aggregator.registerSource(source2);

      const stats = aggregator.getSourceStats();
      expect(stats).toHaveLength(1);
    });

    it('should register multiple different sources', () => {
      const source1 = new MockDataSource('Source1');
      const source2 = new MockDataSource('Source2');

      aggregator.registerSource(source1);
      aggregator.registerSource(source2);

      const stats = aggregator.getSourceStats();
      expect(stats).toHaveLength(2);
    });
  });

  describe('data fetching and caching', () => {
    it('should fetch and cache data from a single source', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event 1',
          source: 'TestSource',
        },
        {
          id: 'test-2',
          timestamp: new Date(),
          location: { latitude: 51.5074, longitude: -0.1278 },
          title: 'Event 2',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);

      await aggregator.fetchAll();

      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(2);
      expect(cachedData[0].title).toBe('Event 1');
      expect(cachedData[1].title).toBe('Event 2');
    });

    it('should merge data from multiple sources', async () => {
      const mockData1: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event from Source 1',
          source: 'Source1',
        },
      ];

      const mockData2: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-2',
          timestamp: new Date(),
          location: { latitude: 51.5074, longitude: -0.1278 },
          title: 'Event from Source 2',
          source: 'Source2',
        },
      ];

      const source1 = new MockDataSource('Source1', mockData1);
      const source2 = new MockDataSource('Source2', mockData2);

      aggregator.registerSource(source1);
      aggregator.registerSource(source2);

      await aggregator.fetchAll();

      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(2);
    });

    it('should filter duplicates based on hash', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date('2025-01-01T00:00:00Z'),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Same Event',
          url: 'https://example.com/event',
          source: 'TestSource',
          category: 'test',
        },
        {
          id: 'test-2', // Different ID
          timestamp: new Date('2025-01-02T00:00:00Z'), // Different timestamp
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Same Event', // Same title
          url: 'https://example.com/event', // Same URL
          source: 'TestSource',
          category: 'test',
          description: 'Different description', // Different description (ignored)
        },
      ];

      // Verify hashes are the same
      const point1 = createGeoDataPoint(mockData[0]);
      const point2 = createGeoDataPoint(mockData[1]);
      expect(point1.hash).toBe(point2.hash); // Hashes should match

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);

      await aggregator.fetchAll();

      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(1); // Should only have one due to deduplication
    });

    it('should add new data on subsequent fetches', async () => {
      const initialData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Initial Event',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', initialData);
      aggregator.registerSource(source);

      await aggregator.fetchAll();
      expect(aggregator.getCachedData()).toHaveLength(1);

      // Add new data
      const newData: Omit<GeoDataPoint, 'hash'>[] = [
        ...initialData,
        {
          id: 'test-2',
          timestamp: new Date(),
          location: { latitude: 51.5074, longitude: -0.1278 },
          title: 'New Event',
          source: 'TestSource',
        },
      ];

      source.setMockData(newData);
      await aggregator.fetchAll();

      expect(aggregator.getCachedData()).toHaveLength(2);
    });

    it('should not re-add existing data', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event',
          url: 'https://example.com/1',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);

      await aggregator.fetchAll();
      expect(aggregator.getCachedData()).toHaveLength(1);

      // Fetch again with same data
      await aggregator.fetchAll();
      expect(aggregator.getCachedData()).toHaveLength(1); // Still only 1
    });
  });

  describe('cache management', () => {
    it('should return cache statistics', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event 1',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);
      await aggregator.fetchAll();

      const stats = aggregator.getCacheStats();
      expect(stats.totalPoints).toBe(1);
      expect(stats.uniqueHashes).toBe(1);
      expect(stats.lastUpdate).toBeDefined();
    });

    it('should clear cache', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event 1',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);
      await aggregator.fetchAll();

      expect(aggregator.getCachedData()).toHaveLength(1);

      aggregator.clearCache();

      expect(aggregator.getCachedData()).toHaveLength(0);
      const stats = aggregator.getCacheStats();
      expect(stats.totalPoints).toBe(0);
      expect(stats.uniqueHashes).toBe(0);
    });

    it('should store data in cache', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date('2025-01-01T00:00:00Z'),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Older Event',
          url: 'https://example.com/1',
          source: 'TestSource',
        },
        {
          id: 'test-2',
          timestamp: new Date('2025-01-02T00:00:00Z'),
          location: { latitude: 51.5074, longitude: -0.1278 },
          title: 'Newer Event',
          url: 'https://example.com/2',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);
      await aggregator.fetchAll();

      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(2);
      expect(cachedData.some(d => d.title === 'Older Event')).toBe(true);
      expect(cachedData.some(d => d.title === 'Newer Event')).toBe(true);
    });
  });

  describe('event emission', () => {
    it('should emit data-updated event when new data is added', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event 1',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);

      let eventEmitted = false;
      aggregator.on('data-updated', (data) => {
        eventEmitted = true;
        expect(data.source).toBe('TestSource');
        expect(data.newDataCount).toBe(1);
      });

      await aggregator.fetchAll();

      expect(eventEmitted).toBe(true);
    });

    it('should not emit event when no new data', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'test-1',
          timestamp: new Date(),
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Event 1',
          source: 'TestSource',
        },
      ];

      const source = new MockDataSource('TestSource', mockData);
      aggregator.registerSource(source);

      await aggregator.fetchAll();

      let eventCount = 0;
      aggregator.on('data-updated', () => {
        eventCount++;
      });

      // Fetch again with same data
      await aggregator.fetchAll();

      expect(eventCount).toBe(0);
    });
  });
});
