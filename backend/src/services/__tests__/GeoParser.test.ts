import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeoParser, getGeoParser, resetGeoParser, ParsedLocation } from '../GeoParser';

// Mock node-geocoder
vi.mock('node-geocoder', () => {
  const mockGeocode = vi.fn();
  return {
    default: vi.fn(() => ({
      geocode: mockGeocode,
    })),
  };
});

// Mock compromise (NLP)
vi.mock('compromise', () => {
  const mockPlaces = vi.fn();
  const mockTopics = vi.fn();
  return {
    default: vi.fn(() => ({
      places: () => ({ out: mockPlaces }),
      topics: () => ({ out: mockTopics }),
    })),
  };
});

describe('GeoParser', () => {
  let parser: GeoParser;
  let mockGeocode: ReturnType<typeof vi.fn>;
  let mockPlaces: ReturnType<typeof vi.fn>;
  let mockTopics: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetGeoParser();

    // Get the mocked functions
    const NodeGeocoder = (await import('node-geocoder')).default;
    mockGeocode = (NodeGeocoder() as any).geocode;
    
    const nlp = (await import('compromise')).default;
    const nlpInstance = nlp('test');
    mockPlaces = nlpInstance.places().out as ReturnType<typeof vi.fn>;
    mockTopics = nlpInstance.topics().out as ReturnType<typeof vi.fn>;

    // Default mock responses
    mockPlaces.mockReturnValue([]);
    mockTopics.mockReturnValue([]);
    mockGeocode.mockResolvedValue([]);

    parser = new GeoParser({ rateLimitDelay: 0 }); // Disable rate limiting for tests
  });

  afterEach(() => {
    resetGeoParser();
  });

  describe('parseLocations', () => {
    it('should return empty array for empty text', async () => {
      const result = await parser.parseLocations('');
      expect(result).toEqual([]);
    });

    it('should return empty array when no places are found', async () => {
      mockPlaces.mockReturnValue([]);
      mockTopics.mockReturnValue([]);

      const result = await parser.parseLocations('Some text without places');
      expect(result).toEqual([]);
    });

    it('should extract and geocode places from text', async () => {
      mockPlaces.mockReturnValue(['Paris']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        {
          latitude: 48.8566,
          longitude: 2.3522,
          city: 'Paris',
          country: 'France',
          formattedAddress: 'Paris, France',
        },
      ]);

      const result = await parser.parseLocations('There was an event in Paris today');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        text: 'Paris',
        latitude: 48.8566,
        longitude: 2.3522,
        city: 'Paris',
        country: 'France',
      });
    });

    it('should deduplicate places from places() and topics()', async () => {
      mockPlaces.mockReturnValue(['London']);
      mockTopics.mockReturnValue(['London', 'UK']);
      mockGeocode
        .mockResolvedValueOnce([
          { latitude: 51.5074, longitude: -0.1278, city: 'London', country: 'UK' },
        ])
        .mockResolvedValueOnce([
          { latitude: 55.3781, longitude: -3.436, country: 'United Kingdom' },
        ]);

      const result = await parser.parseLocations('Event in London, UK');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('London');
      expect(result[1].text).toBe('UK');
    });

    it('should filter out short location names', async () => {
      mockPlaces.mockReturnValue(['A', 'UK']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        { latitude: 55, longitude: -3, country: 'UK' },
      ]);

      const result = await parser.parseLocations('Something in A and UK');

      // Only 'UK' should be processed (2 chars min)
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('UK');
    });

    it('should filter out common words', async () => {
      mockPlaces.mockReturnValue(['the', 'news', 'Paris']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        { latitude: 48.8566, longitude: 2.3522, city: 'Paris' },
      ]);

      const result = await parser.parseLocations('The news from Paris');

      // Only 'Paris' should be geocoded
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Paris');
    });

    it('should respect maxLocations option', async () => {
      const limitedParser = new GeoParser({ maxLocations: 1, rateLimitDelay: 0 });
      mockPlaces.mockReturnValue(['Paris', 'London', 'Tokyo']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        { latitude: 48.8566, longitude: 2.3522, city: 'Paris' },
      ]);

      const result = await limitedParser.parseLocations('Paris, London, Tokyo');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Paris');
    });

    it('should handle geocoding failures gracefully', async () => {
      mockPlaces.mockReturnValue(['UnknownPlace']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockRejectedValue(new Error('Geocoding failed'));

      const result = await parser.parseLocations('Something in UnknownPlace');

      expect(result).toEqual([]);
    });

    it('should return null for places with no geocoding results', async () => {
      mockPlaces.mockReturnValue(['MadeUpPlace']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([]);

      const result = await parser.parseLocations('Event in MadeUpPlace');

      expect(result).toEqual([]);
    });
  });

  describe('parseBestLocation', () => {
    it('should return the first valid location', async () => {
      mockPlaces.mockReturnValue(['Paris', 'London']);
      mockTopics.mockReturnValue([]);
      mockGeocode
        .mockResolvedValueOnce([
          { latitude: 48.8566, longitude: 2.3522, city: 'Paris' },
        ])
        .mockResolvedValueOnce([
          { latitude: 51.5074, longitude: -0.1278, city: 'London' },
        ]);

      const result = await parser.parseBestLocation('Event in Paris and London');

      expect(result).not.toBeNull();
      expect(result?.text).toBe('Paris');
    });

    it('should return null when no locations found', async () => {
      mockPlaces.mockReturnValue([]);
      mockTopics.mockReturnValue([]);

      const result = await parser.parseBestLocation('No places here');

      expect(result).toBeNull();
    });
  });

  describe('caching', () => {
    it('should cache geocoding results', async () => {
      mockPlaces.mockReturnValue(['Paris']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        { latitude: 48.8566, longitude: 2.3522, city: 'Paris' },
      ]);

      // First call
      await parser.parseLocations('Event in Paris');
      // Second call with same location
      await parser.parseLocations('Another event in Paris');

      // Geocode should only be called once due to caching
      expect(mockGeocode).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when clearCache is called', async () => {
      mockPlaces.mockReturnValue(['London']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        { latitude: 51.5074, longitude: -0.1278, city: 'London' },
      ]);

      await parser.parseLocations('Event in London');
      parser.clearCache();
      await parser.parseLocations('Event in London again');

      // Should be called twice after cache clear
      expect(mockGeocode).toHaveBeenCalledTimes(2);
    });

    it('should return cache stats', async () => {
      const stats = parser.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats.size).toBe(0);

      mockPlaces.mockReturnValue(['Berlin']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        { latitude: 52.52, longitude: 13.405, city: 'Berlin' },
      ]);

      await parser.parseLocations('Event in Berlin');
      const statsAfter = parser.getCacheStats();
      expect(statsAfter.size).toBe(1);
    });
  });

  describe('confidence calculation', () => {
    it('should have higher confidence for results with city and country', async () => {
      mockPlaces.mockReturnValue(['Paris']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        {
          latitude: 48.8566,
          longitude: 2.3522,
          city: 'Paris',
          country: 'France',
        },
      ]);

      const result = await parser.parseLocations('Paris');

      expect(result[0].confidence).toBeGreaterThan(0.7);
    });

    it('should have lower confidence for results with only coordinates', async () => {
      mockPlaces.mockReturnValue(['somewhere']);
      mockTopics.mockReturnValue([]);
      mockGeocode.mockResolvedValue([
        {
          latitude: 0,
          longitude: 0,
        },
      ]);

      const result = await parser.parseLocations('somewhere');

      expect(result[0].confidence).toBe(0.5);
    });
  });

  describe('getGeoParser singleton', () => {
    it('should return the same instance', () => {
      resetGeoParser();
      const parser1 = getGeoParser();
      const parser2 = getGeoParser();
      expect(parser1).toBe(parser2);
    });

    it('should reset singleton with resetGeoParser', () => {
      const parser1 = getGeoParser();
      resetGeoParser();
      const parser2 = getGeoParser();
      expect(parser1).not.toBe(parser2);
    });
  });
});

