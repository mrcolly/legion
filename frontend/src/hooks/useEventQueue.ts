/**
 * Hook for managing staggered event toast display
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GeoDataPoint } from '../types/GeoData';
import { DATA } from '../constants';

interface UseEventQueueReturn {
  /** Currently visible events */
  visibleEvents: GeoDataPoint[];
  /** Add events to the queue */
  queueEvents: (events: GeoDataPoint[]) => void;
  /** Dismiss a visible event */
  dismissEvent: (id: string) => void;
  /** Clear all events */
  clearEvents: () => void;
}

/**
 * Manages a queue of events, displaying them one at a time with a delay
 */
export function useEventQueue(
  options: {
    displayDelay?: number;
    maxVisible?: number;
    maxQueueSize?: number;
  } = {}
): UseEventQueueReturn {
  const {
    displayDelay = DATA.TOAST_DELAY,
    maxVisible = DATA.MAX_VISIBLE_TOASTS,
    maxQueueSize = DATA.MAX_QUEUE_SIZE,
  } = options;

  const [visibleEvents, setVisibleEvents] = useState<GeoDataPoint[]>([]);
  
  const queueRef = useRef<GeoDataPoint[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);

  // Process next event in queue
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) {
      isProcessingRef.current = false;
      return;
    }

    isProcessingRef.current = true;

    const nextEvent = queueRef.current.shift();
    if (nextEvent) {
      setVisibleEvents(prev => [nextEvent, ...prev].slice(0, maxVisible));
    }

    if (queueRef.current.length > 0) {
      timerRef.current = setTimeout(processQueue, displayDelay);
    } else {
      isProcessingRef.current = false;
    }
  }, [displayDelay, maxVisible]);

  // Add events to queue
  const queueEvents = useCallback(
    (events: GeoDataPoint[]) => {
      queueRef.current = [...queueRef.current, ...events].slice(0, maxQueueSize);

      if (!isProcessingRef.current) {
        processQueue();
      }
    },
    [processQueue, maxQueueSize]
  );

  // Dismiss a visible event
  const dismissEvent = useCallback((id: string) => {
    setVisibleEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  // Clear all events
  const clearEvents = useCallback(() => {
    queueRef.current = [];
    setVisibleEvents([]);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isProcessingRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    visibleEvents,
    queueEvents,
    dismissEvent,
    clearEvents,
  };
}

