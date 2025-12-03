import { describe, it, expect, beforeEach } from 'vitest';
import { DataAggregator } from '../DataAggregator';
import { DataSourceService } from '../DataSourceService';
import { GeoDataPoint } from '../../types/GeoData';
import { createGeoDataPoint } from '../../utils/hashUtils';

// Mock data source for testing
class MockDataSource extends DataSourceService {
  private mockData: GeoDataPoint[] = [];
  private streamingEnabled = false;

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

  enableStreaming() {
    this.streamingEnabled = true;
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    // If streaming is enabled, emit each point individually
    if (this.streamingEnabled) {
      for (const point of this.mockData) {
        this.emitDataPoint(point);
      }
    }
    // Return the same array reference to ensure hashes are identical
    return [...this.mockData];
  }

  // Expose emitDataPoint for testing
  public testEmitDataPoint(point: GeoDataPoint) {
    this.emitDataPoint(point);
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

  describe('source filtering', () => {
    it('should filter cached data by source name', async () => {
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

      // Filter by Source1 only
      const filtered = aggregator.getCachedData(['Source1']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].source).toBe('Source1');
    });

    it('should filter by multiple sources', async () => {
      const mockData1: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-1', timestamp: new Date(), location: { latitude: 40, longitude: -74 }, title: 'Event 1', source: 'Source1' },
      ];
      const mockData2: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-2', timestamp: new Date(), location: { latitude: 51, longitude: -0.1 }, title: 'Event 2', source: 'Source2' },
      ];
      const mockData3: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-3', timestamp: new Date(), location: { latitude: 35, longitude: 139 }, title: 'Event 3', source: 'Source3' },
      ];

      aggregator.registerSource(new MockDataSource('Source1', mockData1));
      aggregator.registerSource(new MockDataSource('Source2', mockData2));
      aggregator.registerSource(new MockDataSource('Source3', mockData3));
      await aggregator.fetchAll();

      const filtered = aggregator.getCachedData(['Source1', 'Source3']);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(p => p.source).sort()).toEqual(['Source1', 'Source3']);
    });

    it('should be case-insensitive when filtering', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-1', timestamp: new Date(), location: { latitude: 40, longitude: -74 }, title: 'Event 1', source: 'MySource' },
      ];

      aggregator.registerSource(new MockDataSource('MySource', mockData));
      await aggregator.fetchAll();

      const filtered = aggregator.getCachedData(['mysource']);
      expect(filtered).toHaveLength(1);
    });

    it('should return all data when no filter provided', async () => {
      const mockData1: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-1', timestamp: new Date(), location: { latitude: 40, longitude: -74 }, title: 'Event 1', source: 'Source1' },
      ];
      const mockData2: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-2', timestamp: new Date(), location: { latitude: 51, longitude: -0.1 }, title: 'Event 2', source: 'Source2' },
      ];

      aggregator.registerSource(new MockDataSource('Source1', mockData1));
      aggregator.registerSource(new MockDataSource('Source2', mockData2));
      await aggregator.fetchAll();

      expect(aggregator.getCachedData()).toHaveLength(2);
      expect(aggregator.getCachedData([])).toHaveLength(2);
      expect(aggregator.getCachedData(undefined)).toHaveLength(2);
    });

    it('should return available source names', () => {
      aggregator.registerSource(new MockDataSource('Source1'));
      aggregator.registerSource(new MockDataSource('Source2'));
      aggregator.registerSource(new MockDataSource('Source3'));

      const names = aggregator.getAvailableSourceNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('Source1');
      expect(names).toContain('Source2');
      expect(names).toContain('Source3');
    });

    it('should return source info with point counts', async () => {
      const mockData1: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-1', timestamp: new Date(), location: { latitude: 40, longitude: -74 }, title: 'Event 1', source: 'Source1' },
        { id: 'test-2', timestamp: new Date(), location: { latitude: 41, longitude: -75 }, title: 'Event 2', source: 'Source1' },
      ];
      const mockData2: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-3', timestamp: new Date(), location: { latitude: 51, longitude: -0.1 }, title: 'Event 3', source: 'Source2' },
      ];

      aggregator.registerSource(new MockDataSource('Source1', mockData1));
      aggregator.registerSource(new MockDataSource('Source2', mockData2));
      await aggregator.fetchAll();

      const info = aggregator.getSourcesInfo();
      expect(info).toHaveLength(2);
      
      const source1Info = info.find(s => s.name === 'Source1');
      expect(source1Info?.pointCount).toBe(2);
      expect(source1Info?.enabled).toBe(true);

      const source2Info = info.find(s => s.name === 'Source2');
      expect(source2Info?.pointCount).toBe(1);
    });

    it('should get data by specific source', async () => {
      const mockData1: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-1', timestamp: new Date(), location: { latitude: 40, longitude: -74 }, title: 'Event 1', source: 'Source1' },
      ];
      const mockData2: Omit<GeoDataPoint, 'hash'>[] = [
        { id: 'test-2', timestamp: new Date(), location: { latitude: 51, longitude: -0.1 }, title: 'Event 2', source: 'Source2' },
      ];

      aggregator.registerSource(new MockDataSource('Source1', mockData1));
      aggregator.registerSource(new MockDataSource('Source2', mockData2));
      await aggregator.fetchAll();

      const source1Data = aggregator.getDataBySource('Source1');
      expect(source1Data).toHaveLength(1);
      expect(source1Data[0].source).toBe('Source1');

      const unknownData = aggregator.getDataBySource('Unknown');
      expect(unknownData).toHaveLength(0);
    });
  });

  describe('streaming data points', () => {
    it('should handle streamed data points immediately', async () => {
      const source = new MockDataSource('StreamSource');
      aggregator.registerSource(source);

      const point = createGeoDataPoint({
        id: 'stream-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Streamed Event',
        source: 'StreamSource',
      });

      // Emit a single point via streaming
      source.testEmitDataPoint(point);

      // Should be in cache immediately
      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(1);
      expect(cachedData[0].title).toBe('Streamed Event');
    });

    it('should emit event for each streamed point', async () => {
      const source = new MockDataSource('StreamSource');
      aggregator.registerSource(source);

      const events: any[] = [];
      aggregator.on('data-updated', (event) => {
        events.push(event);
      });

      const point1 = createGeoDataPoint({
        id: 'stream-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Event 1',
        source: 'StreamSource',
      });

      const point2 = createGeoDataPoint({
        id: 'stream-2',
        timestamp: new Date(),
        location: { latitude: 51.5074, longitude: -0.1278 },
        title: 'Event 2',
        source: 'StreamSource',
      });

      source.testEmitDataPoint(point1);
      source.testEmitDataPoint(point2);

      expect(events).toHaveLength(2);
      expect(events[0].newDataCount).toBe(1);
      expect(events[1].newDataCount).toBe(1);
    });

    it('should deduplicate streamed points by hash', async () => {
      const source = new MockDataSource('StreamSource');
      aggregator.registerSource(source);

      const point1 = createGeoDataPoint({
        id: 'stream-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Same Event',
        url: 'https://example.com/event',
        source: 'StreamSource',
      });

      const point2 = createGeoDataPoint({
        id: 'stream-2', // Different ID
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Same Event', // Same title
        url: 'https://example.com/event', // Same URL = same hash
        source: 'StreamSource',
      });

      source.testEmitDataPoint(point1);
      source.testEmitDataPoint(point2);

      // Should only have one point due to hash deduplication
      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(1);
    });

    it('should handle streaming and batch together', async () => {
      const mockData: Omit<GeoDataPoint, 'hash'>[] = [
        {
          id: 'batch-1',
          timestamp: new Date(),
          location: { latitude: 51.5074, longitude: -0.1278 },
          title: 'Batch Event',
          source: 'MixedSource',
        },
      ];

      const source = new MockDataSource('MixedSource', mockData);
      source.enableStreaming(); // Enable streaming mode
      aggregator.registerSource(source);

      // This will both stream and return batch
      await aggregator.fetchAll();

      // Should only have 1 point (not duplicated)
      const cachedData = aggregator.getCachedData();
      expect(cachedData).toHaveLength(1);
      expect(cachedData[0].title).toBe('Batch Event');
    });

    it('should stream points from multiple sources in parallel', async () => {
      const source1 = new MockDataSource('Source1');
      const source2 = new MockDataSource('Source2');
      
      aggregator.registerSource(source1);
      aggregator.registerSource(source2);

      const events: string[] = [];
      aggregator.on('data-updated', (event) => {
        events.push(event.source);
      });

      const point1 = createGeoDataPoint({
        id: 'src1-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'From Source 1',
        source: 'Source1',
      });

      const point2 = createGeoDataPoint({
        id: 'src2-1',
        timestamp: new Date(),
        location: { latitude: 51.5074, longitude: -0.1278 },
        title: 'From Source 2',
        source: 'Source2',
      });

      // Emit from both sources
      source1.testEmitDataPoint(point1);
      source2.testEmitDataPoint(point2);

      expect(events).toContain('Source1');
      expect(events).toContain('Source2');
      expect(aggregator.getCachedData()).toHaveLength(2);
    });
  });
});
