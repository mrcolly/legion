import axios from 'axios';
import { DataSourceService } from '../services/DataSourceService';
import { GeoDataPoint, DataSourceConfig } from '../types/GeoData';
import { createGeoDataPoint } from '../utils/hashUtils';
import { GeoParser, getGeoParser } from '../services/GeoParser';

/**
 * Mastodon data source
 * Fetches public posts from Mastodon instances and extracts locations
 * Uses geoparsing to find locations mentioned in posts
 */

// =============================================================================
// Types
// =============================================================================

interface MastodonAccount {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  url: string;
  avatar: string;
  note: string;
}

interface MastodonStatus {
  id: string;
  created_at: string;
  content: string;
  url: string;
  uri: string;
  account: MastodonAccount;
  visibility: string;
  language: string | null;
  spoiler_text: string;
  sensitive: boolean;
  reblogs_count: number;
  favourites_count: number;
  replies_count: number;
  tags: Array<{ name: string; url: string }>;
}

// Popular Mastodon instances with active public timelines
const MASTODON_INSTANCES = [
  { url: 'https://mastodon.social', name: 'Mastodon Social' },
  { url: 'https://mas.to', name: 'Mas.to' },
  { url: 'https://techhub.social', name: 'TechHub' },
  { url: 'https://fosstodon.org', name: 'Fosstodon' },
  { url: 'https://infosec.exchange', name: 'Infosec Exchange' },
];

// =============================================================================
// Mastodon Source Implementation
// =============================================================================

export class MastodonSource extends DataSourceService {
  private geoParser: GeoParser;
  private instances: typeof MASTODON_INSTANCES;

  constructor(config?: Partial<DataSourceConfig> & {
    instances?: typeof MASTODON_INSTANCES;
  }) {
    super({
      name: 'Mastodon',
      enabled: true,
      refreshInterval: 60000, // 1 minute
      maxResults: 20, // Per instance
      ...config,
    });

    this.geoParser = getGeoParser();
    this.instances = config?.instances ?? MASTODON_INSTANCES;
  }

  async fetchData(): Promise<GeoDataPoint[]> {
    this.logger.debug({ instances: this.instances.length }, 'Fetching Mastodon posts...');

    const allPoints: GeoDataPoint[] = [];

    // Fetch from all instances in parallel
    const results = await Promise.allSettled(
      this.instances.map(instance => this.fetchFromInstance(instance))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPoints.push(...result.value);
      }
    }

    this.updateStats(true, allPoints.length);
    this.logger.info({ count: allPoints.length }, 'Successfully fetched Mastodon data');

    return allPoints;
  }

  private async fetchFromInstance(
    instance: { url: string; name: string }
  ): Promise<GeoDataPoint[]> {
    try {
      const response = await axios.get<MastodonStatus[]>(
        `${instance.url}/api/v1/timelines/public`,
        {
          params: {
            limit: this.config.maxResults,
            local: false, // Include federated posts
          },
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      const posts = response.data;
      this.logger.debug({ instance: instance.name, count: posts.length }, 'Posts received');

      // Transform posts with location extraction
      const points: GeoDataPoint[] = [];

      for (const post of posts) {
        const point = await this.transformPost(post, instance);
        if (point) {
          this.emitDataPoint(point);
          points.push(point);
        }
      }

      return points;
    } catch (error) {
      this.logger.warn({ instance: instance.name, error }, 'Failed to fetch from instance');
      return [];
    }
  }

  private async transformPost(
    post: MastodonStatus,
    instance: { url: string; name: string }
  ): Promise<GeoDataPoint | null> {
    // Strip HTML tags from content
    const textContent = this.stripHtml(post.content);

    // Skip very short posts or sensitive content
    if (textContent.length < 20 || post.sensitive) {
      return null;
    }

    // Try to extract location from post content
    const location = await this.geoParser.parseBestLocation(textContent);

    // Skip posts without identifiable location
    if (!location || location.confidence < 0.6) {
      return null;
    }

    // Extract hashtags
    const hashtags = post.tags.map(t => `#${t.name}`).join(' ');

    return createGeoDataPoint({
      id: `mastodon-${post.id}`,
      timestamp: new Date(post.created_at),
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.confidence >= 0.8 ? 5000 : 20000,
      },
      title: this.createTitle(textContent, post.account),
      description: this.createDescription(post, location, instance),
      url: post.url,
      source: this.getName(),
      category: 'social',
      metadata: {
        author: post.account.display_name || post.account.username,
        authorUrl: post.account.url,
        instance: instance.name,
        language: post.language,
        hashtags: post.tags.map(t => t.name),
        reblogs: post.reblogs_count,
        favourites: post.favourites_count,
        parsedLocation: location.text,
        geoConfidence: location.confidence,
      },
    });
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<p>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createTitle(content: string, account: MastodonAccount): string {
    // Truncate content for title
    const maxLength = 80;
    const truncated = content.length > maxLength
      ? content.substring(0, maxLength) + '...'
      : content;

    const author = account.display_name || account.username;
    return `💬 ${author}: ${truncated}`;
  }

  private createDescription(
    post: MastodonStatus,
    location: { text: string; formattedAddress?: string },
    instance: { name: string }
  ): string {
    const parts: string[] = [];

    parts.push(`📍 ${location.formattedAddress || location.text}`);
    parts.push(`🦣 ${instance.name}`);

    if (post.reblogs_count > 0 || post.favourites_count > 0) {
      parts.push(`🔄 ${post.reblogs_count} ⭐ ${post.favourites_count}`);
    }

    if (post.tags.length > 0) {
      const tags = post.tags.slice(0, 3).map(t => `#${t.name}`).join(' ');
      parts.push(tags);
    }

    return parts.join(' | ');
  }
}
