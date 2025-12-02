import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGeoData } from '../useGeoData';
import * as api from '../../services/api';
import type { GeoDataPoint, DataUpdateEvent } from '../../types/GeoData';

// Mock the API module
vi.mock('../../services/api', () => ({
  fetchGeoData: vi.fn(),
  subscribeToUpdates: vi.fn(),
}));

// Mock the logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('useGeoData Hook', () => {
  const mockData: GeoDataPoint[] = [
    {
      id: 'test-1',
      hash: 'hash-1',
      timestamp: '2025-01-01T12:00:00Z',
      location: { latitude: 40.7128, longitude: -74.006 },
      title: 'Test Event 1',
      source: 'Demo',
    },
    {
      id: 'test-2',
      hash: 'hash-2',
      timestamp: '2025-01-01T13:00:00Z',
      location: { latitude: 51.5074, longitude: -0.1278 },
      title: 'Test Event 2',
      source: 'Demo',
    },
  ];

  let unsubscribeMock: ReturnType<typeof vi.fn>;
  let updateCallback: ((event: DataUpdateEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    updateCallback = null;
    unsubscribeMock = vi.fn();

    // Mock fetchGeoData
    vi.mocked(api.fetchGeoData).mockResolvedValue(mockData);

    // Mock subscribeToUpdates to capture the callback
    vi.mocked(api.subscribeToUpdates).mockImplementation((onUpdate) => {
      updateCallback = onUpdate;
      return unsubscribeMock;
    });
  });

  it('should fetch initial data on mount', async () => {
    const { result } = renderHook(() => useGeoData());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(api.fetchGeoData).toHaveBeenCalledWith({ sort: 'desc', limit: undefined });
  });

  it('should pass limit option to fetchGeoData', async () => {
    const { result } = renderHook(() => useGeoData({ limit: 10 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.fetchGeoData).toHaveBeenCalledWith({ sort: 'desc', limit: 10 });
  });

  it('should handle fetch error', async () => {
    const error = new Error('Network error');
    vi.mocked(api.fetchGeoData).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useGeoData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.data).toHaveLength(0);
  });

  it('should subscribe to updates when autoRefresh is true', async () => {
    const { result } = renderHook(() => useGeoData({ autoRefresh: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.subscribeToUpdates).toHaveBeenCalled();
  });

  it('should not subscribe to updates when autoRefresh is false', async () => {
    const { result } = renderHook(() => useGeoData({ autoRefresh: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.subscribeToUpdates).not.toHaveBeenCalled();
  });

  it('should handle real-time updates', async () => {
    const { result } = renderHook(() => useGeoData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.newDataCount).toBe(0);

    // Simulate SSE update
    const newEvent: DataUpdateEvent = {
      type: 'data-updated',
      source: 'Demo',
      newDataCount: 1,
      totalCount: 3,
      newData: [
        {
          id: 'test-3',
          hash: 'hash-3',
          timestamp: '2025-01-01T14:00:00Z',
          location: { latitude: 35.6762, longitude: 139.6503 },
          title: 'Test Event 3',
          source: 'Demo',
        },
      ],
      timestamp: '2025-01-01T14:00:00Z',
    };

    act(() => {
      updateCallback?.(newEvent);
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.newDataCount).toBe(1);
  });

  it('should deduplicate data based on hash', async () => {
    const { result } = renderHook(() => useGeoData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Try to add a duplicate (same hash)
    const duplicateEvent: DataUpdateEvent = {
      type: 'data-updated',
      source: 'Demo',
      newDataCount: 1,
      totalCount: 3,
      newData: [
        {
          id: 'test-1-duplicate',
          hash: 'hash-1', // Same hash as existing item
          timestamp: '2025-01-01T15:00:00Z',
          location: { latitude: 40.7128, longitude: -74.006 },
          title: 'Duplicate Event',
          source: 'Demo',
        },
      ],
      timestamp: '2025-01-01T15:00:00Z',
    };

    act(() => {
      updateCallback?.(duplicateEvent);
    });

    // Should still have 2 items (duplicate filtered)
    expect(result.current.data).toHaveLength(2);
  });

  it('should unsubscribe on unmount', async () => {
    const { result, unmount } = renderHook(() => useGeoData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('should provide refresh function', async () => {
    const { result } = renderHook(() => useGeoData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Add some new data
    act(() => {
      updateCallback?.({
        type: 'data-updated',
        source: 'Demo',
        newDataCount: 1,
        totalCount: 3,
        newData: [
          {
            id: 'test-3',
            hash: 'hash-3',
            timestamp: '2025-01-01T14:00:00Z',
            location: { latitude: 35.6762, longitude: 139.6503 },
            title: 'Test Event 3',
            source: 'Demo',
          },
        ],
        timestamp: '2025-01-01T14:00:00Z',
      });
    });

    expect(result.current.newDataCount).toBe(1);

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    // newDataCount should be reset
    expect(result.current.newDataCount).toBe(0);
  });

  it('should set lastUpdate when data is received', async () => {
    const { result } = renderHook(() => useGeoData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastUpdate).toBeInstanceOf(Date);
  });
});
