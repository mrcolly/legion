import { GeoDataPoint, DataSourceConfig, DataSourceStats } from '../types/GeoData';
import { createLogger } from '../utils/logger';

/**
 * Callback function when data source has new data (batch)
 */
export type DataUpdateCallback = (sourceName: string, data: GeoDataPoint[]) => void;

/**
 * Callback for streaming individual data points as they're ready
 */
export type DataPointStreamCallback = (sourceName: string, point: GeoDataPoint) => void;

/**
 * Abstract interface that all data sources must implement
 * This allows us to easily swap or add new data sources
 * Each source manages its own refresh cycle
 */
export abstract class DataSourceService {
  protected config: DataSourceConfig;
  protected stats: DataSourceStats;
  protected logger: ReturnType<typeof createLogger>;
  private refreshTimer?: NodeJS.Timeout;
  private onDataUpdate?: DataUpdateCallback;
  private onDataPointStream?: DataPointStreamCallback;

  constructor(config: DataSourceConfig) {
    this.config = config;
    this.stats = {
      totalFetched: 0,
      errors: 0,
      isHealthy: true,
    };
    this.logger = createLogger({ component: 'DataSource', source: config.name });
  }

  /**
   * Fetch data from the source
   * @returns Array of geo-located data points
   */
  abstract fetchData(): Promise<GeoDataPoint[]>;

  /**
   * Get the name of this data source
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Check if this data source is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get statistics about this data source
   */
  getStats(): DataSourceStats {
    return { ...this.stats };
  }

  /**
   * Update statistics after a fetch operation
   */
  protected updateStats(success: boolean, count: number = 0): void {
    this.stats.lastFetchTime = new Date();
    if (success) {
      this.stats.totalFetched += count;
      this.stats.isHealthy = true;
    } else {
      this.stats.errors += 1;
      this.stats.isHealthy = false;
    }
  }

  /**
   * Optional: Initialize the data source (setup connections, auth, etc.)
   */
  async initialize(): Promise<void> {
    // Override if needed
  }

  /**
   * Optional: Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopAutoRefresh();
    // Override if needed
  }

  /**
   * Set the callback to be called when this source has new data (batch)
   */
  setDataUpdateCallback(callback: DataUpdateCallback): void {
    this.onDataUpdate = callback;
  }

  /**
   * Set the callback for streaming individual data points
   */
  setDataPointStreamCallback(callback: DataPointStreamCallback): void {
    this.onDataPointStream = callback;
  }

  /**
   * Emit a single data point immediately (for streaming)
   */
  protected emitDataPoint(point: GeoDataPoint): void {
    if (this.onDataPointStream) {
      this.onDataPointStream(this.getName(), point);
    }
  }

  /**
   * Get the refresh interval for this source
   */
  getRefreshInterval(): number | undefined {
    return this.config.refreshInterval;
  }

  /**
   * Start auto-refresh cycle for this source
   * Each source fetches on its own schedule
   */
  startAutoRefresh(): void {
    if (!this.config.refreshInterval) {
      this.logger.info('No refresh interval configured, skipping auto-refresh');
      return;
    }

    if (this.refreshTimer) {
      this.logger.warn('Auto-refresh already running');
      return;
    }

    this.logger.info({ intervalMs: this.config.refreshInterval }, 'Starting auto-refresh');

    this.refreshTimer = setInterval(async () => {
      try {
        this.logger.debug('Auto-refreshing...');
        const data = await this.fetchData();
        
        // Notify aggregator of new data
        if (this.onDataUpdate) {
          this.onDataUpdate(this.getName(), data);
        }
      } catch (error) {
        this.logger.error({ error }, 'Error during auto-refresh');
      }
    }, this.config.refreshInterval);
  }

  /**
   * Stop auto-refresh cycle
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      this.logger.info('Stopping auto-refresh');
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Check if auto-refresh is running
   */
  isAutoRefreshRunning(): boolean {
    return this.refreshTimer !== undefined;
  }
}
