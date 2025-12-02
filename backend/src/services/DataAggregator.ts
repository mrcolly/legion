import { EventEmitter } from 'node:events';
import { DataSourceService } from './DataSourceService';
import { GeoDataPoint } from '../types/GeoData';
import { createLogger } from '../utils/logger';

/**
 * Aggregates data from multiple sources
 * Handles caching, deduplication, and data merging
 * Emits events when cache is updated
 */
export class DataAggregator extends EventEmitter {
  private readonly sources: Map<string, DataSourceService> = new Map();
  private readonly sourceData: Map<string, GeoDataPoint[]> = new Map();
  private readonly seenHashes: Set<string> = new Set(); // Track seen data point hashes
  private cache: GeoDataPoint[] = [];
  private lastUpdate: Date | null = null;
  private readonly logger = createLogger({ component: 'DataAggregator' });

  constructor() {
    super();
  }

  /**
   * Register a new data source
   */
  registerSource(source: DataSourceService): void {
    if (this.sources.has(source.getName())) {
      this.logger.warn({ source: source.getName() }, 'Data source already registered');
      return;
    }

    this.sources.set(source.getName(), source);
    
    // Set up callback for this source to update cache
    source.setDataUpdateCallback((sourceName, data) => {
      this.handleSourceUpdate(sourceName, data);
    });
    
    this.logger.info({ source: source.getName() }, 'Registered data source');
  }

  /**
   * Unregister a data source
   */
  unregisterSource(name: string): void {
    this.sources.delete(name);
    this.logger.info({ source: name }, 'Unregistered data source');
  }

  /**
   * Get all registered sources
   */
  getSources(): DataSourceService[] {
    return Array.from(this.sources.values());
  }

  /**
   * Handle update from a single source
   * Called when a source fetches new data (either initial or auto-refresh)
   * Only adds NEW data points that haven't been seen before
   * Emits 'data-updated' event when new data is added
   */
  private handleSourceUpdate(sourceName: string, data: GeoDataPoint[]): void {
    // Filter for only NEW data points (not seen before in this batch OR globally)
    const batchHashes = new Set<string>();
    const newData: GeoDataPoint[] = [];
    
    for (const point of data) {
      if (point.hash && !this.seenHashes.has(point.hash) && !batchHashes.has(point.hash)) {
        newData.push(point);
        batchHashes.add(point.hash);
        this.seenHashes.add(point.hash); // Add immediately to prevent duplicates
      }
    }
    
    if (newData.length > 0) {
      
      // Get existing data from this source
      const existingData = this.sourceData.get(sourceName) || [];
      
      // Combine existing + new data for this source
      const updatedData = [...existingData, ...newData];
      this.sourceData.set(sourceName, updatedData);
      
      // Rebuild cache with new data
      this.rebuildCache();
      
      this.logger.info({
        source: sourceName,
        newPoints: newData.length,
        totalCache: this.cache.length,
      }, `✓ ${sourceName} updated - Added ${newData.length} new points`);
      
      // Emit event for real-time updates
      this.emit('data-updated', {
        source: sourceName,
        newDataCount: newData.length,
        totalCount: this.cache.length,
        newData,
        timestamp: new Date(),
      });
    } else {
      this.logger.debug({
        source: sourceName,
        duplicateCount: data.length,
      }, `○ ${sourceName} updated - No new data (duplicates filtered)`);
    }
  }

  /**
   * Rebuild cache by merging data from all sources that have provided data
   * No deduplication needed here since we use hash-based filtering on input
   */
  private rebuildCache(): void {
    // Merge all source data
    const allData: GeoDataPoint[] = [];
    for (const data of this.sourceData.values()) {
      allData.push(...data);
    }

    // Update cache (no deduplication needed, already done via hashes)
    this.cache = allData;
    this.lastUpdate = new Date();
  }

  /**
   * Fetch data from all enabled sources (initial load)
   * Updates cache incrementally as each source completes (non-blocking)
   */
  async fetchAll(): Promise<GeoDataPoint[]> {
    const enabledSources = Array.from(this.sources.values()).filter((source) =>
      source.isEnabled()
    );

    if (enabledSources.length === 0) {
      this.logger.warn('No enabled data sources');
      return [];
    }

    this.logger.info({ sourceCount: enabledSources.length }, `📡 Initial fetch from ${enabledSources.length} sources...`);

    let completedCount = 0;

    // Start all fetches in parallel
    const fetchPromises = enabledSources.map(async (source) => {
      try {
        const data = await source.fetchData();
        
        // Update via callback (same path as auto-refresh)
        this.handleSourceUpdate(source.getName(), data);
        completedCount++;
        
        this.logger.info({
          progress: `${completedCount}/${enabledSources.length}`,
          source: source.getName(),
        }, `✓ Initial fetch completed`);
        
        return { source: source.getName(), data, success: true };
      } catch (error) {
        completedCount++;
        this.logger.error({
          progress: `${completedCount}/${enabledSources.length}`,
          source: source.getName(),
          error,
        }, `✗ Error fetching from source`);
        return { source: source.getName(), data: [], success: false, error };
      }
    });

    // Wait for all to complete (but cache updates happened incrementally)
    await Promise.all(fetchPromises);

    this.logger.info({ totalPoints: this.cache.length }, `✓ Initial fetch complete`);
    return this.cache;
  }

  /**
   * Start auto-refresh cycles for all enabled sources
   * Each source will refresh on its own schedule
   */
  startAutoRefresh(): void {
    const enabledSources = Array.from(this.sources.values()).filter((source) =>
      source.isEnabled()
    );

    if (enabledSources.length === 0) {
      this.logger.warn('No enabled data sources to auto-refresh');
      return;
    }

    this.logger.info({ sourceCount: enabledSources.length }, `🔄 Starting auto-refresh for ${enabledSources.length} sources`);
    
    enabledSources.forEach((source) => {
      const interval = source.getRefreshInterval();
      if (interval) {
        source.startAutoRefresh();
      } else {
        this.logger.info({ source: source.getName() }, 'No refresh interval configured, skipping auto-refresh');
      }
    });
  }

  /**
   * Stop all auto-refresh cycles
   */
  stopAutoRefresh(): void {
    this.logger.info('🛑 Stopping all auto-refresh cycles');
    Array.from(this.sources.values()).forEach((source) => {
      source.stopAutoRefresh();
    });
  }

  /**
   * Get cached data
   */
  getCachedData(): GeoDataPoint[] {
    return [...this.cache];
  }

  /**
   * Get the last update time
   */
  getLastUpdateTime(): Date | null {
    return this.lastUpdate;
  }

  /**
   * Get statistics from all sources
   */
  getSourceStats() {
    return Array.from(this.sources.values()).map((source) => ({
      name: source.getName(),
      enabled: source.isEnabled(),
      stats: source.getStats(),
    }));
  }

  /**
   * Clear all cached data and reset seen hashes
   * Useful for testing or manual cache clearing
   */
  clearCache(): void {
    this.cache = [];
    this.sourceData.clear();
    this.seenHashes.clear();
    this.lastUpdate = null;
    this.logger.info('✓ Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      totalPoints: this.cache.length,
      uniqueHashes: this.seenHashes.size,
      sourceCount: this.sourceData.size,
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Initialize all sources
   */
  async initialize(): Promise<void> {
    const sources = Array.from(this.sources.values());
    await Promise.all(sources.map((source) => source.initialize()));
  }

  /**
   * Cleanup all sources
   */
  async cleanup(): Promise<void> {
    this.stopAutoRefresh();
    const sources = Array.from(this.sources.values());
    await Promise.all(sources.map((source) => source.cleanup()));
  }
}
