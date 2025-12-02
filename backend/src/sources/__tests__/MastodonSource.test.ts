import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { MastodonSource } from '../MastodonSource';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock GeoParser
vi.mock('../../services/GeoParser', () => ({
  getGeoParser: () => ({
    parseBestLocation: vi.fn().mockResolvedValue({
      text: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
      confidence: 0.8,
      formattedAddress: 'New York, NY, USA',
    }),
  }),
}));

describe('MastodonSource', () => {
  let source: MastodonSource;

  const mockMastodonResponse = {
    data: [
      {
        id: '123456',
        created_at: '2024-01-15T12:00:00Z',
        content: '<p>Just arrived in New York City! The weather is amazing here. #NYC #travel</p>',
        url: 'https://mastodon.social/@user/123456',
        uri: 'https://mastodon.social/users/user/statuses/123456',
        account: {
          id: '1',
          username: 'traveler',
          acct: 'traveler',
          display_name: 'World Traveler',
          url: 'https://mastodon.social/@traveler',
          avatar: 'https://example.com/avatar.png',
          note: 'Love to travel',
        },
        visibility: 'public',
        language: 'en',
        spoiler_text: '',
        sensitive: false,
        reblogs_count: 5,
        favourites_count: 10,
        replies_count: 2,
        tags: [
          { name: 'NYC', url: 'https://mastodon.social/tags/NYC' },
          { name: 'travel', url: 'https://mastodon.social/tags/travel' },
        ],
      },
      {
        id: '123457',
        created_at: '2024-01-15T11:30:00Z',
        content: '<p>Hello world</p>', // Too short, should be skipped
        url: 'https://mastodon.social/@user/123457',
        uri: 'https://mastodon.social/users/user/statuses/123457',
        account: {
          id: '2',
          username: 'shortpost',
          acct: 'shortpost',
          display_name: 'Short',
          url: 'https://mastodon.social/@shortpost',
          avatar: 'https://example.com/avatar2.png',
          note: '',
        },
        visibility: 'public',
        language: 'en',
        spoiler_text: '',
        sensitive: false,
        reblogs_count: 0,
        favourites_count: 0,
        replies_count: 0,
        tags: [],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    source = new MastodonSource({ 
      enabled: true,
      instances: [{ url: 'https://mastodon.social', name: 'Mastodon Social' }],
    });
    mockedAxios.get.mockResolvedValue(mockMastodonResponse);
  });

  it('should be initialized with correct config', () => {
    expect(source.getName()).toBe('Mastodon');
    expect(source.isEnabled()).toBe(true);
  });

  it('should fetch posts from Mastodon instances', async () => {
    const data = await source.fetchData();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://mastodon.social/api/v1/timelines/public',
      expect.any(Object)
    );
    // Only 1 post because the second one is too short
    expect(data).toHaveLength(1);
  });

  it('should transform Mastodon posts to GeoDataPoints', async () => {
    const data = await source.fetchData();

    expect(data[0]).toMatchObject({
      id: expect.stringContaining('mastodon-123456'),
      source: 'Mastodon',
      category: 'social',
      location: {
        latitude: 40.7128,
        longitude: -74.006,
      },
    });
    expect(data[0].metadata).toMatchObject({
      author: 'World Traveler',
      instance: 'Mastodon Social',
      hashtags: ['NYC', 'travel'],
    });
  });

  it('should strip HTML from post content', async () => {
    const data = await source.fetchData();

    expect(data[0].title).not.toContain('<p>');
    expect(data[0].title).not.toContain('</p>');
  });

  it('should skip posts that are too short', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [mockMastodonResponse.data[1]], // Only short post
    });

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
  });

  it('should skip sensitive posts', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{
        ...mockMastodonResponse.data[0],
        sensitive: true,
      }],
    });

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
  });

  it('should handle empty response', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
  });

  it('should handle API errors gracefully', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const data = await source.fetchData();
    expect(data).toHaveLength(0);
  });

  it('should fetch from multiple instances', async () => {
    const multiSource = new MastodonSource({
      enabled: true,
      instances: [
        { url: 'https://mastodon.social', name: 'Mastodon Social' },
        { url: 'https://fosstodon.org', name: 'Fosstodon' },
      ],
    });

    await multiSource.fetchData();

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should include engagement metrics in description', async () => {
    const data = await source.fetchData();

    expect(data[0].description).toContain('🔄 5'); // reblogs
    expect(data[0].description).toContain('⭐ 10'); // favourites
  });
});
