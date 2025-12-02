import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { ISSSource } from '../ISSSource';
import { MovingObjectTracker } from '../../services/MovingObjectTracker';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('ISSSource', () => {
  let tracker: MovingObjectTracker;
  let source: ISSSource;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new MovingObjectTracker(5);
    source = new ISSSource(tracker, 5000);
  });

  afterEach(() => {
    source.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('should start the source and fetch immediately', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          message: 'success',
          timestamp: Math.floor(Date.now() / 1000),
          iss_position: {
            latitude: '45.0',
            longitude: '-93.0',
          },
        },
      });

      source.start();

      // Wait for the initial fetch
      await vi.advanceTimersByTimeAsync(100);

      expect(mockedAxios.get).toHaveBeenCalledOnce();
      expect(source.isEnabled()).toBe(true);
    });

    it('should not start twice', () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          message: 'success',
          timestamp: Math.floor(Date.now() / 1000),
          iss_position: { latitude: '45.0', longitude: '-93.0' },
        },
      });

      source.start();
      source.start();

      // Should only have one initial fetch, not two
      expect(mockedAxios.get).toHaveBeenCalledOnce();
    });
  });

  describe('stop', () => {
    it('should stop the source', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          message: 'success',
          timestamp: Math.floor(Date.now() / 1000),
          iss_position: { latitude: '45.0', longitude: '-93.0' },
        },
      });

      source.start();
      await vi.advanceTimersByTimeAsync(100);

      source.stop();

      expect(source.isEnabled()).toBe(false);

      // Advance time and verify no more calls
      const callCount = mockedAxios.get.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockedAxios.get).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('fetchPosition', () => {
    it('should update tracker with ISS position', async () => {
      const updateHandler = vi.fn();
      tracker.on('object-updated', updateHandler);

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          message: 'success',
          timestamp: Math.floor(Date.now() / 1000),
          iss_position: {
            latitude: '45.123',
            longitude: '-93.456',
          },
        },
      });

      source.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(updateHandler).toHaveBeenCalledOnce();
      
      const obj = tracker.getObject('iss');
      expect(obj).toBeDefined();
      expect(obj?.name).toBe('International Space Station');
      expect(obj?.type).toBe('satellite');
      expect(obj?.color).toBe('#00ff88');
      expect(obj?.positions[0].latitude).toBeCloseTo(45.123);
      expect(obj?.positions[0].longitude).toBeCloseTo(-93.456);
    });

    it('should fetch at regular intervals', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          message: 'success',
          timestamp: Math.floor(Date.now() / 1000),
          iss_position: { latitude: '45.0', longitude: '-93.0' },
        },
      });

      source.start();
      
      // Initial fetch
      await vi.advanceTimersByTimeAsync(100);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // After 5 seconds
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);

      // After another 5 seconds
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      source.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should not throw, tracker should have no objects
      expect(tracker.getCount()).toBe(0);
    });

    it('should handle non-success API response', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          message: 'error',
        },
      });

      source.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should not add to tracker
      expect(tracker.getCount()).toBe(0);
    });

    it('should include ISS metadata', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          message: 'success',
          timestamp: Math.floor(Date.now() / 1000),
          iss_position: { latitude: '45.0', longitude: '-93.0' },
        },
      });

      source.start();
      await vi.advanceTimersByTimeAsync(100);

      const obj = tracker.getObject('iss');
      expect(obj?.icon).toBe('🛰️');
      expect(obj?.velocity).toBe(27600);
      expect(obj?.positions[0].altitude).toBe(420);
      expect(obj?.metadata?.source).toBe('open-notify');
      expect(obj?.metadata?.orbitalPeriod).toBe(92);
    });
  });

  describe('position history', () => {
    it('should accumulate positions over time', async () => {
      let lat = 45.0;
      mockedAxios.get.mockImplementation(() => {
        lat += 1;
        return Promise.resolve({
          data: {
            message: 'success',
            timestamp: Math.floor(Date.now() / 1000),
            iss_position: { latitude: lat.toString(), longitude: '-93.0' },
          },
        });
      });

      source.start();

      // 3 fetches
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      const obj = tracker.getObject('iss');
      expect(obj?.positions).toHaveLength(3);
      expect(obj?.positions[0].latitude).toBe(46);
      expect(obj?.positions[1].latitude).toBe(47);
      expect(obj?.positions[2].latitude).toBe(48);
    });
  });
});
