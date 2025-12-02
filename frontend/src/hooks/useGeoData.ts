import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoDataPoint, DataUpdateEvent } from '../types/GeoData';
import { fetchGeoData, subscribeToUpdates } from '../services/api';

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
  
  const dataMapRef = useRef<Map<string, GeoDataPoint>>(new Map());

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const geoData = await fetchGeoData({ sort: 'desc', limit });
      
      // Store in map for deduplication
      dataMapRef.current.clear();
      geoData.forEach(point => {
        const key = point.hash || point.id;
        dataMapRef.current.set(key, point);
      });
      
      setData(geoData);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Handle SSE updates
  const handleUpdate = useCallback((event: DataUpdateEvent) => {
    if (event.type === 'data-updated' && event.newData?.length > 0) {
      setNewDataCount(prev => prev + event.newData.length);
      
      // Add new data to map (deduplication)
      event.newData.forEach(point => {
        const key = point.hash || point.id;
        if (!dataMapRef.current.has(key)) {
          dataMapRef.current.set(key, point);
        }
      });
      
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
    refresh,
  };
}
