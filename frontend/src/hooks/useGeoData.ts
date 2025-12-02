import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GeoDataPoint, DataUpdateEvent } from '../types/GeoData';
import { fetchGeoData, subscribeToUpdates } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger({ hook: 'useGeoData' });

// Maximum number of points to keep on the map
const MAX_POINTS = 1000;

// Debounce helper for batch updates
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

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

  // Pending data state update ref (for debounced updates)
  const pendingDataUpdateRef = useRef<GeoDataPoint[] | null>(null);
  
  // Debounced data update to batch rapid SSE events
  const flushDataUpdate = useMemo(() => debounce(() => {
    if (pendingDataUpdateRef.current) {
      setData(pendingDataUpdateRef.current);
      setLastUpdate(new Date());
      pendingDataUpdateRef.current = null;
    }
  }, 100), []); // 100ms debounce for rapid updates

  // Handle SSE updates - optimized for performance
  const handleUpdate = useCallback((event: DataUpdateEvent) => {
    if (event.type !== 'data-updated' || !event.newData?.length) return;
    
    logger.debug({ source: event.source, newCount: event.newData.length }, 'Received data update');
    
    // Add new data to map (deduplication)
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
    
    // Batch state updates - React 18 will automatically batch these
    setNewDataCount(prev => prev + addedCount);
    
    // Add new events to pending (for toast notifications)
    if (newlyAdded.length > 0) {
      setPendingEvents(prev => {
        // Avoid creating new array if at limit and no room
        if (prev.length >= 20) {
          return [...newlyAdded.slice(0, 20 - prev.length), ...prev].slice(0, 20);
        }
        return [...newlyAdded, ...prev].slice(0, 20);
      });
    }
    
    // Prepare sorted data - only sort if we have new data
    const allData = Array.from(dataMapRef.current.values());
    
    // Sort by timestamp (newest first) - use numeric comparison for speed
    allData.sort((a, b) => {
      const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
      const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
      return timeB - timeA;
    });
    
    // Limit to MAX_POINTS
    const limitedData = allData.length > MAX_POINTS ? allData.slice(0, MAX_POINTS) : allData;
    
    // Trim the map to keep only the points we're displaying
    if (dataMapRef.current.size > MAX_POINTS) {
      const keysToKeep = new Set(limitedData.map(p => p.hash || p.id));
      for (const key of dataMapRef.current.keys()) {
        if (!keysToKeep.has(key)) {
          dataMapRef.current.delete(key);
        }
      }
      logger.debug({ trimmedTo: dataMapRef.current.size }, 'Trimmed old points from cache');
    }
    
    // Debounce the data update to batch rapid events
    pendingDataUpdateRef.current = limitedData;
    flushDataUpdate();
  }, [flushDataUpdate]);

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
