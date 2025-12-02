import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle, debounce, isDaytime, clamp, normalize } from '../helpers';

describe('helpers', () => {
  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should call function immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not call function again within delay', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call function again after delay', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to function', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not call function immediately', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();
    });

    it('should call function after delay', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset delay on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('isDaytime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true during daytime hours (6-18)', () => {
      vi.setSystemTime(new Date('2025-01-01T12:00:00'));
      expect(isDaytime()).toBe(true);

      vi.setSystemTime(new Date('2025-01-01T06:00:00'));
      expect(isDaytime()).toBe(true);

      vi.setSystemTime(new Date('2025-01-01T17:59:00'));
      expect(isDaytime()).toBe(true);
    });

    it('should return false during nighttime hours', () => {
      vi.setSystemTime(new Date('2025-01-01T05:59:00'));
      expect(isDaytime()).toBe(false);

      vi.setSystemTime(new Date('2025-01-01T18:00:00'));
      expect(isDaytime()).toBe(false);

      vi.setSystemTime(new Date('2025-01-01T23:00:00'));
      expect(isDaytime()).toBe(false);
    });

    it('should use custom day start and end', () => {
      vi.setSystemTime(new Date('2025-01-01T07:00:00'));
      expect(isDaytime(8, 20)).toBe(false);
      expect(isDaytime(7, 20)).toBe(true);
    });
  });

  describe('clamp', () => {
    it('should return value if within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('should return min if value is below', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should return max if value is above', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('normalize', () => {
    it('should normalize value to 0-1 range', () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(0, 0, 10)).toBe(0);
      expect(normalize(10, 0, 10)).toBe(1);
    });

    it('should clamp normalized value', () => {
      expect(normalize(-5, 0, 10)).toBe(0);
      expect(normalize(15, 0, 10)).toBe(1);
    });

    it('should handle different ranges', () => {
      expect(normalize(150, 100, 200)).toBe(0.5);
      expect(normalize(-50, -100, 0)).toBe(0.5);
    });
  });
});
