/**
 * Hook for managing geo data with real-time updates
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GeoDataPoint, DataUpdateEvent } from '../types/GeoData';
import { fetchGeoData, subscribeToUpdates } from '../services/api';
import { createLogger } from '../utils/logger';
import { debounce } from '../utils/helpers';
import { useEventQueue } from './useEventQueue';
import { DATA } from '../constants';

const logger = createLogger({ hook: 'useGeoData' });

// =============================================================================
// Types
// =============================================================================

interface UseGeoDataOptions {
  autoRefresh?: boolean;
  limit?: number;
  sources?: string[]; // Filter by data sources
}

interface UseGeoDataReturn {
  data: GeoDataPoint[];
  loading: boolean;
  error: Error | null;
  isConnected: boolean;
  lastUpdate: Date | null;
  newDataCount: number;
  pendingEvents: GeoDataPoint[];
  dismissEvent: (id: string) => void;
  refresh: () => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useGeoData(options: UseGeoDataOptions = {}): UseGeoDataReturn {
  const { autoRefresh = true, limit, sources } = options;
  
  // Stringify sources for stable dependency comparison
  const sourcesKey = sources?.sort().join(',') || '';

  // State
  const [data, setData] = useState<GeoDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newDataCount, setNewDataCount] = useState(0);

  // Refs
  const dataMapRef = useRef<Map<string, GeoDataPoint>>(new Map());
  const pendingDataUpdateRef = useRef<GeoDataPoint[] | null>(null);

  // Event queue for staggered toast display
  const {
    visibleEvents: pendingEvents,
    queueEvents,
    dismissEvent,
  } = useEventQueue();

  // ---------------------------------------------------------------------------
  // Fetch initial data
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      logger.debug({ limit, sources }, 'Fetching geo data');
      const geoData = await fetchGeoData({ sort: 'desc', limit, sources });

      // Store in map for deduplication
      dataMapRef.current.clear();
      const limitedData = geoData.slice(0, DATA.MAX_POINTS);
      limitedData.forEach((point) => {
        const key = point.hash || point.id;
        dataMapRef.current.set(key, point);
      });

      logger.info({ count: limitedData.length, maxPoints: DATA.MAX_POINTS, sources }, 'Geo data loaded');
      setData(limitedData);
      setLastUpdate(new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      logger.error({ error: error.message }, 'Failed to fetch geo data');
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [limit, sources]);

  // ---------------------------------------------------------------------------
  // Debounced data update
  // ---------------------------------------------------------------------------
  const flushDataUpdate = useMemo(
    () =>
      debounce(() => {
        if (pendingDataUpdateRef.current) {
          setData(pendingDataUpdateRef.current);
          setLastUpdate(new Date());
          pendingDataUpdateRef.current = null;
        }
      }, DATA.UPDATE_DEBOUNCE),
    []
  );

  // ---------------------------------------------------------------------------
  // Handle SSE updates
  // ---------------------------------------------------------------------------
  const handleUpdate = useCallback(
    (event: DataUpdateEvent) => {
      if (event.type !== 'data-updated' || !event.newData?.length) return;

      logger.debug({ source: event.source, newCount: event.newData.length }, 'Received data update');

      // Deduplicate and add new data
      let addedCount = 0;
      const newlyAdded: GeoDataPoint[] = [];

      for (const point of event.newData) {
        const key = point.hash || point.id;
        if (!dataMapRef.current.has(key)) {
          dataMapRef.current.set(key, point);
          newlyAdded.push(point);
          addedCount++;
        }
      }

      if (addedCount === 0) return;

      logger.info({ addedCount, totalCount: dataMapRef.current.size }, 'New points added');

      // Update counts and queue events
      setNewDataCount((prev) => prev + addedCount);
      if (newlyAdded.length > 0) {
        queueEvents(newlyAdded);
      }

      // Sort by timestamp (newest first)
      const allData = Array.from(dataMapRef.current.values());
      allData.sort((a, b) => {
        const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
        const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
        return timeB - timeA;
      });

      // Limit and trim
      const limitedData = allData.slice(0, DATA.MAX_POINTS);

      if (dataMapRef.current.size > DATA.MAX_POINTS) {
        const keysToKeep = new Set(limitedData.map((p) => p.hash || p.id));
        for (const key of dataMapRef.current.keys()) {
          if (!keysToKeep.has(key)) {
            dataMapRef.current.delete(key);
          }
        }
        logger.debug({ trimmedTo: dataMapRef.current.size }, 'Trimmed old points from cache');
      }

      // Debounced update
      pendingDataUpdateRef.current = limitedData;
      flushDataUpdate();
    },
    [flushDataUpdate, queueEvents]
  );

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!autoRefresh) return;

    const unsubscribe = subscribeToUpdates(
      (event) => {
        setIsConnected(true);
        handleUpdate(event);
      },
      () => {
        setIsConnected(false);
      },
      sources
    );

    const timeout = setTimeout(() => setIsConnected(true), 1000);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [autoRefresh, handleUpdate, sourcesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset new data count every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNewDataCount(0);
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    setNewDataCount(0);
    await fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    data,
    loading,
    error,
    isConnected,
    lastUpdate,
    newDataCount,
    pendingEvents,
    dismissEvent,
    refresh,
  };
}
