/**
 * Hook for tracking moving objects (satellites, aircraft, ships, etc.)
 */

import { useState, useEffect, useCallback } from 'react';
import type { MovingObject } from '../types/GeoData';
import { fetchMovingObjects, subscribeToMovingObjects } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger({ hook: 'useMovingObjects' });

// =============================================================================
// Types
// =============================================================================

interface UseMovingObjectsReturn {
  objects: MovingObject[];
  loading: boolean;
  error: Error | null;
}

// =============================================================================
// Hook
// =============================================================================

export function useMovingObjects(): UseMovingObjectsReturn {
  const [objects, setObjects] = useState<Map<string, MovingObject>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial objects
  const fetchInitial = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchMovingObjects();
      
      const objectMap = new Map<string, MovingObject>();
      for (const obj of data) {
        objectMap.set(obj.id, obj);
      }
      setObjects(objectMap);
      
      logger.info({ count: data.length }, 'Moving objects loaded');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch moving objects');
      logger.error({ error: error.message }, 'Failed to fetch moving objects');
      setError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Subscribe to SSE updates
  useEffect(() => {
    const unsubscribe = subscribeToMovingObjects(
      (event) => {
        // Update or add object
        setObjects(prev => {
          const next = new Map(prev);
          next.set(event.object.id, event.object);
          return next;
        });
        logger.debug({ id: event.object.id, name: event.object.name }, 'Object updated');
      },
      (event) => {
        // Remove object
        setObjects(prev => {
          const next = new Map(prev);
          next.delete(event.id);
          return next;
        });
        logger.debug({ id: event.id }, 'Object removed');
      },
      undefined, // Don't handle data updates here
      () => {
        logger.warn('Moving objects SSE connection lost');
      }
    );

    return unsubscribe;
  }, []);

  return {
    objects: Array.from(objects.values()),
    loading,
    error,
  };
}
