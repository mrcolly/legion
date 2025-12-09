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
  private static readonly MAX_CACHE_SIZE = 10000; // Maximum points to keep in cache
  private static readonly MAX_PER_SOURCE = 2000; // Maximum points per source
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
    
    // Set up batch callback for this source (backward compatibility)
    source.setDataUpdateCallback((sourceName, data) => {
      this.handleSourceUpdate(sourceName, data);
    });

    // Set up streaming callback for real-time data points
    source.setDataPointStreamCallback((sourceName, point) => {
      this.handleStreamedDataPoint(sourceName, point);
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
   * Handle a single streamed data point (real-time)
   * Called as soon as a data point is ready from any source
   */
  private handleStreamedDataPoint(sourceName: string, point: GeoDataPoint): void {
    // Skip if we've already seen this hash
    if (point.hash && this.seenHashes.has(point.hash)) {
      return;
    }

    // Mark as seen
    if (point.hash) {
      this.seenHashes.add(point.hash);
    }

    // Get or create source data array
    let sourceData = this.sourceData.get(sourceName) || [];
    sourceData.push(point);
    
    // Enforce per-source limit (keep newest)
    if (sourceData.length > DataAggregator.MAX_PER_SOURCE) {
      const removed = sourceData.shift(); // Remove oldest
      if (removed?.hash) {
        this.seenHashes.delete(removed.hash);
      }
    }
    
    this.sourceData.set(sourceName, sourceData);

    // Add to cache (at the beginning since it's newest)
    this.cache.unshift(point);
    
    // Enforce cache limit
    if (this.cache.length > DataAggregator.MAX_CACHE_SIZE) {
      const removed = this.cache.pop();
      if (removed?.hash) {
        this.seenHashes.delete(removed.hash);
      }
    }
    
    this.lastUpdate = new Date();

    // Emit event for real-time updates (single point)
    this.emit('data-updated', {
      source: sourceName,
      newDataCount: 1,
      totalCount: this.cache.length,
      newData: [point],
      timestamp: new Date(),
    });

    this.logger.debug({
      source: sourceName,
      title: point.title?.substring(0, 40),
      totalCache: this.cache.length,
    }, `⚡ Streamed point added`);
  }

  /**
   * Handle update from a single source (batch mode)
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
      let updatedData = [...existingData, ...newData];
      
      // Enforce per-source limit (keep newest)
      if (updatedData.length > DataAggregator.MAX_PER_SOURCE) {
        // Sort by timestamp (newest first) and keep only MAX_PER_SOURCE
        updatedData.sort((a, b) => {
          const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
          const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
          return timeB - timeA;
        });
        updatedData = updatedData.slice(0, DataAggregator.MAX_PER_SOURCE);
        
        this.logger.info({
          source: sourceName,
          before: existingData.length + newData.length,
          after: updatedData.length,
        }, `Source data trimmed to ${DataAggregator.MAX_PER_SOURCE} points`);
      }
      
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
   * Enforces MAX_CACHE_SIZE limit, keeping newest data
   */
  private rebuildCache(): void {
    // Merge all source data
    const allData: GeoDataPoint[] = [];
    for (const data of this.sourceData.values()) {
      allData.push(...data);
    }

    // Sort by timestamp (newest first) and limit
    allData.sort((a, b) => {
      const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
      const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
      return timeB - timeA;
    });

    // Enforce cache size limit
    if (allData.length > DataAggregator.MAX_CACHE_SIZE) {
      const trimmed = allData.slice(0, DataAggregator.MAX_CACHE_SIZE);
      
      // Clean up seenHashes for removed items
      const keptHashes = new Set(trimmed.map(p => p.hash).filter(Boolean));
      for (const hash of this.seenHashes) {
        if (!keptHashes.has(hash)) {
          this.seenHashes.delete(hash);
        }
      }
      
      this.logger.info({ 
        before: allData.length, 
        after: trimmed.length 
      }, `Cache trimmed to ${DataAggregator.MAX_CACHE_SIZE} points`);
      
      this.cache = trimmed;
    } else {
      this.cache = allData;
    }
    
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
   * Get cached data (optionally filtered by sources)
   */
  getCachedData(sourcesFilter?: string[]): GeoDataPoint[] {
    // If no filter, return all cached data
    if (!sourcesFilter || sourcesFilter.length === 0) {
      return [...this.cache];
    }

    // Filter by source names (case-insensitive)
    const normalizedFilter = new Set(sourcesFilter.map(s => s.toLowerCase()));
    return this.cache.filter(point => 
      point.source && normalizedFilter.has(point.source.toLowerCase())
    );
  }

  /**
   * Get data for specific sources only
   */
  getDataBySource(sourceName: string): GeoDataPoint[] {
    return this.sourceData.get(sourceName) || [];
  }

  /**
   * Get list of available source names
   */
  getAvailableSourceNames(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Get source info (name, enabled status, point count)
   */
  getSourcesInfo(): Array<{ name: string; enabled: boolean; pointCount: number }> {
    return Array.from(this.sources.entries()).map(([name, source]) => ({
      name,
      enabled: source.isEnabled(),
      pointCount: (this.sourceData.get(name) || []).length,
    }));
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
      maxPoints: DataAggregator.MAX_CACHE_SIZE,
      maxPerSource: DataAggregator.MAX_PER_SOURCE,
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
