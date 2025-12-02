import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoDataPoint, DataUpdateEvent } from '../types/GeoData';
import { fetchGeoData, subscribeToUpdates } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger({ hook: 'useGeoData' });

interface UseGeoDataOptions {
  autoRefresh?: boolean;
  limit?: number;
}

interface UseGeoDataReturn {
  data: GeoDataPoint[];
  loading: boolean;
  error: Error | null;
  isConnected: boolean;
  lastUpdate: Date | null;
  newDataCount: number;
  latestEvent: GeoDataPoint | null;
  clearLatestEvent: () => void;
  refresh: () => Promise<void>;
}

/**
 * Custom hook to manage geo data with real-time updates
 */
export function useGeoData(options: UseGeoDataOptions = {}): UseGeoDataReturn {
  const { autoRefresh = true, limit } = options;
  
  const [data, setData] = useState<GeoDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newDataCount, setNewDataCount] = useState(0);
  const [latestEvent, setLatestEvent] = useState<GeoDataPoint | null>(null);
  
  const dataMapRef = useRef<Map<string, GeoDataPoint>>(new Map());

  const clearLatestEvent = useCallback(() => {
    setLatestEvent(null);
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.debug({ limit }, 'Fetching geo data');
      const geoData = await fetchGeoData({ sort: 'desc', limit });
      
      // Store in map for deduplication
      dataMapRef.current.clear();
      geoData.forEach(point => {
        const key = point.hash || point.id;
        dataMapRef.current.set(key, point);
      });
      
      logger.info({ count: geoData.length }, 'Geo data loaded');
      setData(geoData);
      setLastUpdate(new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      logger.error({ error: error.message }, 'Failed to fetch geo data');
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Handle SSE updates
  const handleUpdate = useCallback((event: DataUpdateEvent) => {
    if (event.type === 'data-updated' && event.newData?.length > 0) {
      logger.debug({ source: event.source, newCount: event.newData.length }, 'Received data update');
      
      setNewDataCount(prev => prev + event.newData.length);
      
      // Add new data to map (deduplication)
      let addedCount = 0;
      event.newData.forEach(point => {
        const key = point.hash || point.id;
        if (!dataMapRef.current.has(key)) {
          dataMapRef.current.set(key, point);
          addedCount++;
        }
      });
      
      if (addedCount > 0) {
        logger.info({ addedCount, totalCount: dataMapRef.current.size }, 'New points added');
        // Set the latest event for toast notification
        setLatestEvent(event.newData[0]);
      }
      
      // Update state with sorted data (newest first)
      const allData = Array.from(dataMapRef.current.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setData(allData);
      setLastUpdate(new Date());
    }
  }, []);

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
      }
    );

    // Set connected after a short delay (SSE doesn't have onopen in standard)
    const timeout = setTimeout(() => setIsConnected(true), 1000);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [autoRefresh, handleUpdate]);

  const refresh = useCallback(async () => {
    setNewDataCount(0);
    await fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    isConnected,
    lastUpdate,
    newDataCount,
    latestEvent,
    clearLatestEvent,
    refresh,
  };
}
