import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RSSSource } from '../RSSSource';

describe('RSSSource', () => {
  let rssSource: RSSSource;

  beforeEach(() => {
    vi.clearAllMocks();
    rssSource = new RSSSource({
      feeds: [
        {
          url: 'https://example.com/feed.xml',
          name: 'Test Feed',
          location: {
            city: 'New York',
            country: 'United States',
            latitude: 40.7128,
            longitude: -74.006,
          },
          category: 'news',
          language: 'en',
        },
      ],
      itemsPerFeed: 3,
    });
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const source = new RSSSource();
      expect(source.getName()).toBe('RSS');
      expect(source.isEnabled()).toBe(true);
    });

    it('should accept custom config', () => {
      const source = new RSSSource({
        name: 'CustomRSS',
        enabled: false,
        refreshInterval: 600000,
      });
      expect(source.getName()).toBe('CustomRSS');
      expect(source.isEnabled()).toBe(false);
      expect(source.getRefreshInterval()).toBe(600000);
    });

    it('should use default feeds when none provided', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();
      expect(feeds.length).toBeGreaterThan(0);
    });

    it('should use custom feeds when provided', () => {
      expect(rssSource.getFeeds()).toHaveLength(1);
      expect(rssSource.getFeeds()[0].name).toBe('Test Feed');
    });

    it('should have default refresh interval of 5 minutes', () => {
      const source = new RSSSource();
      expect(source.getRefreshInterval()).toBe(300000);
    });
  });

  describe('fetchData', () => {
    it('should return array', async () => {
      // Even if feeds fail, should return empty array
      const source = new RSSSource({
        feeds: [
          {
            url: 'https://invalid-url-that-will-fail.com/feed.xml',
            name: 'Failing Feed',
            location: { city: 'NYC', country: 'US', latitude: 40, longitude: -74 },
          },
        ],
      });

      const data = await source.fetchData();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should update stats after fetch', async () => {
      const source = new RSSSource({
        feeds: [],
      });

      await source.fetchData();
      const stats = source.getStats();

      expect(stats.lastFetchTime).toBeDefined();
      expect(stats.isHealthy).toBe(true);
    });
  });

  describe('getFeeds', () => {
    it('should return copy of feeds array', () => {
      const feeds = rssSource.getFeeds();
      feeds.push({
        url: 'https://new.com/feed',
        name: 'New',
        location: { city: 'LA', country: 'US', latitude: 34, longitude: -118 },
      });

      // Original should not be modified
      expect(rssSource.getFeeds()).toHaveLength(1);
    });
  });

  describe('addFeed', () => {
    it('should add new feed to list', () => {
      const newFeed = {
        url: 'https://new.com/feed.xml',
        name: 'New Feed',
        location: {
          city: 'Los Angeles',
          country: 'United States',
          latitude: 34.0522,
          longitude: -118.2437,
        },
      };

      rssSource.addFeed(newFeed);

      expect(rssSource.getFeeds()).toHaveLength(2);
      expect(rssSource.getFeeds()[1].name).toBe('New Feed');
    });
  });

  describe('getStats', () => {
    it('should return stats object', () => {
      const stats = rssSource.getStats();

      expect(stats).toHaveProperty('totalFetched');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('isHealthy');
    });

    it('should start with zero fetched', () => {
      const stats = rssSource.getStats();
      expect(stats.totalFetched).toBe(0);
    });

    it('should start healthy', () => {
      const stats = rssSource.getStats();
      expect(stats.isHealthy).toBe(true);
    });
  });

  describe('default feeds', () => {
    it('should include feeds from multiple regions', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();

      const countries = new Set(feeds.map((f) => f.location.country));

      // Should have feeds from multiple countries
      expect(countries.size).toBeGreaterThan(5);
    });

    it('should include major news outlets', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();
      const names = feeds.map((f) => f.name);

      // Check for some major outlets
      expect(names).toContain('BBC World');
      expect(names).toContain('New York Times');
      expect(names).toContain('The Guardian');
    });

    it('should include tech news outlets', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();
      const names = feeds.map((f) => f.name);

      expect(names).toContain('Ars Technica');
      expect(names).toContain('TechCrunch');
    });

    it('should have valid coordinates for all feeds', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();

      for (const feed of feeds) {
        expect(feed.location.latitude).toBeGreaterThanOrEqual(-90);
        expect(feed.location.latitude).toBeLessThanOrEqual(90);
        expect(feed.location.longitude).toBeGreaterThanOrEqual(-180);
        expect(feed.location.longitude).toBeLessThanOrEqual(180);
      }
    });

    it('should have URLs for all feeds', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();

      for (const feed of feeds) {
        expect(feed.url).toBeDefined();
        expect(feed.url.startsWith('http')).toBe(true);
      }
    });

    it('should have location info for all feeds', () => {
      const source = new RSSSource();
      const feeds = source.getFeeds();

      for (const feed of feeds) {
        expect(feed.location.city).toBeDefined();
        expect(feed.location.country).toBeDefined();
      }
    });
  });

  describe('auto-refresh', () => {
    afterEach(() => {
      rssSource.stopAutoRefresh();
    });

    it('should start auto-refresh', () => {
      rssSource.startAutoRefresh();
      expect(rssSource.isAutoRefreshRunning()).toBe(true);
    });

    it('should stop auto-refresh', () => {
      rssSource.startAutoRefresh();
      rssSource.stopAutoRefresh();
      expect(rssSource.isAutoRefreshRunning()).toBe(false);
    });
  });
});
