import { describe, it, expect } from 'vitest';
import { generateHash, createGeoDataPoint } from '../hashUtils';
import { GeoDataPoint } from '../../types/GeoData';

describe('hashUtils', () => {
  describe('generateHash', () => {
    it('should generate consistent hash for same content', () => {
      const dataPoint: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date('2025-01-01T00:00:00Z'),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        url: 'https://example.com/test',
        source: 'TestSource',
        category: 'test',
      };

      const hash1 = generateHash(dataPoint);
      const hash2 = generateHash(dataPoint);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should generate different hash for different titles', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Event A',
        source: 'TestSource',
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        title: 'Event B',
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different URLs', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        url: 'https://example.com/a',
        source: 'TestSource',
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        url: 'https://example.com/b',
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different locations', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        source: 'TestSource',
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        location: { latitude: 51.5074, longitude: -0.1278 }, // London
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).not.toBe(hash2);
    });

    it('should ignore timestamp differences', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date('2025-01-01T00:00:00Z'),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        source: 'TestSource',
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        timestamp: new Date('2025-01-02T00:00:00Z'), // Different timestamp
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).toBe(hash2); // Should be same since timestamp is not included
    });

    it('should ignore description differences', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        description: 'Description A',
        source: 'TestSource',
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        description: 'Description B', // Different description
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).toBe(hash2); // Should be same since description is not included
    });

    it('should ignore metadata differences', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        source: 'TestSource',
        metadata: { key1: 'value1' },
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        metadata: { key2: 'value2' }, // Different metadata
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).toBe(hash2); // Should be same since metadata is not included
    });

    it('should round coordinates to fixed precision', () => {
      const dataPoint1: Omit<GeoDataPoint, 'hash'> = {
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.71280001, longitude: -74.006001 },
        title: 'Test Event',
        source: 'TestSource',
      };

      const dataPoint2: Omit<GeoDataPoint, 'hash'> = {
        ...dataPoint1,
        location: { latitude: 40.71280002, longitude: -74.006002 },
      };

      const hash1 = generateHash(dataPoint1);
      const hash2 = generateHash(dataPoint2);

      expect(hash1).toBe(hash2); // Should be same due to rounding to 4 decimal places
    });
  });

  describe('createGeoDataPoint', () => {
    it('should create data point with hash', () => {
      const dataPoint = createGeoDataPoint({
        id: 'test-1',
        timestamp: new Date(),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        source: 'TestSource',
      });

      expect(dataPoint.hash).toBeDefined();
      expect(dataPoint.hash).toHaveLength(64);
      expect(dataPoint.title).toBe('Test Event');
    });

    it('should preserve all original properties', () => {
      const originalData = {
        id: 'test-1',
        timestamp: new Date('2025-01-01T00:00:00Z'),
        location: { latitude: 40.7128, longitude: -74.006 },
        title: 'Test Event',
        description: 'Test Description',
        url: 'https://example.com/test',
        source: 'TestSource',
        category: 'test',
        metadata: { key: 'value' },
      };

      const dataPoint = createGeoDataPoint(originalData);

      expect(dataPoint.id).toBe(originalData.id);
      expect(dataPoint.timestamp).toBe(originalData.timestamp);
      expect(dataPoint.location).toEqual(originalData.location);
      expect(dataPoint.title).toBe(originalData.title);
      expect(dataPoint.description).toBe(originalData.description);
      expect(dataPoint.url).toBe(originalData.url);
      expect(dataPoint.source).toBe(originalData.source);
      expect(dataPoint.category).toBe(originalData.category);
      expect(dataPoint.metadata).toEqual(originalData.metadata);
      expect(dataPoint.hash).toBeDefined();
    });
  });
});
