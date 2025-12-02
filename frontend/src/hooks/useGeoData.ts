import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoDataPoint, DataUpdateEvent } from '../types/GeoData';
import { fetchGeoData, subscribeToUpdates } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger({ hook: 'useGeoData' });

// Maximum number of points to keep on the map
const MAX_POINTS = 1000;

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
  pendingEvents: GeoDataPoint[];
  dismissEvent: (id: string) => void;
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
  const [pendingEvents, setPendingEvents] = useState<GeoDataPoint[]>([]);
  
  const dataMapRef = useRef<Map<string, GeoDataPoint>>(new Map());

  const dismissEvent = useCallback((id: string) => {
    setPendingEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.debug({ limit }, 'Fetching geo data');
      const geoData = await fetchGeoData({ sort: 'desc', limit });
      
      // Store in map for deduplication, limited to MAX_POINTS
      dataMapRef.current.clear();
      const limitedData = geoData.slice(0, MAX_POINTS);
      limitedData.forEach(point => {
        const key = point.hash || point.id;
        dataMapRef.current.set(key, point);
      });
      
      logger.info({ count: limitedData.length, maxPoints: MAX_POINTS }, 'Geo data loaded');
      setData(limitedData);
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
        // Add all new events to pending events for toast notifications
        const newEvents = event.newData.filter(point => {
          const key = point.hash || point.id;
          return dataMapRef.current.has(key);
        });
        setPendingEvents(prev => [...newEvents, ...prev].slice(0, 20)); // Keep max 20 pending
      }
      
      // Update state with sorted data (newest first), limited to MAX_POINTS
      const allData = Array.from(dataMapRef.current.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, MAX_POINTS);
      
      // Trim the map to keep only the points we're displaying
      if (dataMapRef.current.size > MAX_POINTS) {
        const keysToKeep = new Set(allData.map(p => p.hash || p.id));
        for (const key of dataMapRef.current.keys()) {
          if (!keysToKeep.has(key)) {
            dataMapRef.current.delete(key);
          }
        }
        logger.debug({ trimmedTo: dataMapRef.current.size }, 'Trimmed old points from cache');
      }
      
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
    pendingEvents,
    dismissEvent,
    refresh,
  };
}
