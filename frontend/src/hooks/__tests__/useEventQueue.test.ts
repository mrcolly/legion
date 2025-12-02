import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventQueue } from '../useEventQueue';
import type { GeoDataPoint } from '../../types/GeoData';

describe('useEventQueue Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockEvent = (id: string): GeoDataPoint => ({
    id,
    hash: `hash-${id}`,
    timestamp: new Date().toISOString(),
    location: { latitude: 0, longitude: 0 },
    title: `Event ${id}`,
    source: 'Test',
  });

  it('should start with empty visible events', () => {
    const { result } = renderHook(() => useEventQueue());

    expect(result.current.visibleEvents).toHaveLength(0);
  });

  it('should show first event immediately when queued', () => {
    const { result } = renderHook(() => useEventQueue());

    act(() => {
      result.current.queueEvents([createMockEvent('1')]);
    });

    expect(result.current.visibleEvents).toHaveLength(1);
    expect(result.current.visibleEvents[0].id).toBe('1');
  });

  it('should show events one at a time with delay', () => {
    const { result } = renderHook(() =>
      useEventQueue({ displayDelay: 500 })
    );

    act(() => {
      result.current.queueEvents([
        createMockEvent('1'),
        createMockEvent('2'),
        createMockEvent('3'),
      ]);
    });

    // First event shows immediately
    expect(result.current.visibleEvents).toHaveLength(1);
    expect(result.current.visibleEvents[0].id).toBe('1');

    // After 500ms, second event shows
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.visibleEvents).toHaveLength(2);
    expect(result.current.visibleEvents[0].id).toBe('2');

    // After another 500ms, third event shows
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.visibleEvents).toHaveLength(3);
    expect(result.current.visibleEvents[0].id).toBe('3');
  });

  it('should respect maxVisible limit', () => {
    const { result } = renderHook(() =>
      useEventQueue({ displayDelay: 100, maxVisible: 2 })
    );

    act(() => {
      result.current.queueEvents([
        createMockEvent('1'),
        createMockEvent('2'),
        createMockEvent('3'),
      ]);
    });

    // First event
    expect(result.current.visibleEvents).toHaveLength(1);

    // Second event
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.visibleEvents).toHaveLength(2);

    // Third event - should still be 2 (oldest removed)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.visibleEvents).toHaveLength(2);
    expect(result.current.visibleEvents[0].id).toBe('3');
    expect(result.current.visibleEvents[1].id).toBe('2');
  });

  it('should dismiss event by id', () => {
    const { result } = renderHook(() => useEventQueue());

    act(() => {
      result.current.queueEvents([createMockEvent('1'), createMockEvent('2')]);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.visibleEvents).toHaveLength(2);

    act(() => {
      result.current.dismissEvent('1');
    });

    expect(result.current.visibleEvents).toHaveLength(1);
    expect(result.current.visibleEvents[0].id).toBe('2');
  });

  it('should clear all events', () => {
    const { result } = renderHook(() => useEventQueue());

    act(() => {
      result.current.queueEvents([
        createMockEvent('1'),
        createMockEvent('2'),
        createMockEvent('3'),
      ]);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.visibleEvents.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearEvents();
    });

    expect(result.current.visibleEvents).toHaveLength(0);
  });

  it('should respect maxQueueSize limit', () => {
    const { result } = renderHook(() =>
      useEventQueue({ maxQueueSize: 3, displayDelay: 100 })
    );

    // Queue more events than maxQueueSize
    act(() => {
      result.current.queueEvents([
        createMockEvent('1'),
        createMockEvent('2'),
        createMockEvent('3'),
        createMockEvent('4'),
        createMockEvent('5'),
      ]);
    });

    // Process all events
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should only have processed 3 events (maxQueueSize)
    expect(result.current.visibleEvents.length).toBeLessThanOrEqual(3);
  });

  it('should handle multiple queueEvents calls', () => {
    const { result } = renderHook(() =>
      useEventQueue({ displayDelay: 100 })
    );

    act(() => {
      result.current.queueEvents([createMockEvent('1')]);
    });

    expect(result.current.visibleEvents).toHaveLength(1);

    // Queue more while processing
    act(() => {
      result.current.queueEvents([createMockEvent('2'), createMockEvent('3')]);
      vi.advanceTimersByTime(100);
    });

    expect(result.current.visibleEvents.length).toBeGreaterThanOrEqual(2);
  });
});
