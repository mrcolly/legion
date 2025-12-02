import { describe, it, expect } from 'vitest';
import { getPointColor, getPointSize, getZoomScale, scatterCrowdedPoints } from '../pointUtils';
import type { GeoDataPoint } from '../../types/GeoData';
import { COLORS, POINT_SIZE } from '../../constants';

describe('pointUtils', () => {
  const createMockPoint = (overrides: Partial<GeoDataPoint> = {}): GeoDataPoint => ({
    id: 'test-1',
    hash: 'hash-1',
    timestamp: new Date().toISOString(),
    location: { latitude: 40.7128, longitude: -74.006 },
    title: 'Test Event',
    source: 'Demo',
    ...overrides,
  });

  describe('getPointColor', () => {
    it('should return source color when source exists', () => {
      const point = createMockPoint({ source: 'GDELT' });
      expect(getPointColor(point)).toBe(COLORS.SOURCE.GDELT);
    });

    it('should return category color when no source match', () => {
      const point = createMockPoint({ source: undefined, category: 'news' });
      expect(getPointColor(point)).toBe(COLORS.CATEGORY.news);
    });

    it('should return default color when no match', () => {
      const point = createMockPoint({ source: undefined, category: undefined });
      expect(getPointColor(point)).toBe(COLORS.CATEGORY.default);
    });

    it('should prioritize source over category', () => {
      const point = createMockPoint({ source: 'GDELT', category: 'demo' });
      expect(getPointColor(point)).toBe(COLORS.SOURCE.GDELT);
    });
  });

  describe('getPointSize', () => {
    it('should return size based on base + variation', () => {
      const point = createMockPoint({ id: 'A' }); // 'A'.codePointAt(0) = 65
      const size = getPointSize(point);
      
      expect(size).toBeGreaterThanOrEqual(POINT_SIZE.BASE);
      expect(size).toBeLessThanOrEqual(POINT_SIZE.BASE + POINT_SIZE.VARIATION);
    });

    it('should return different sizes for different IDs', () => {
      const point1 = createMockPoint({ id: 'A' });
      const point2 = createMockPoint({ id: 'Z' });

      const size1 = getPointSize(point1);
      const size2 = getPointSize(point2);

      // Sizes should be different due to different character codes
      expect(size1).not.toBe(size2);
    });
  });

  describe('getZoomScale', () => {
    it('should return min scale at min altitude', () => {
      const scale = getZoomScale(0.1, 0.1, 4.0);
      expect(scale).toBeCloseTo(POINT_SIZE.MIN_SCALE, 2);
    });

    it('should return max scale at max altitude', () => {
      const scale = getZoomScale(4.0, 0.1, 4.0);
      expect(scale).toBeCloseTo(POINT_SIZE.MAX_SCALE, 2);
    });

    it('should return mid scale at mid altitude', () => {
      const scale = getZoomScale(2.05, 0.1, 4.0);
      const midScale = (POINT_SIZE.MIN_SCALE + POINT_SIZE.MAX_SCALE) / 2;
      expect(scale).toBeCloseTo(midScale, 1);
    });

    it('should clamp below min altitude', () => {
      const scale = getZoomScale(-1, 0.1, 4.0);
      expect(scale).toBe(POINT_SIZE.MIN_SCALE);
    });

    it('should clamp above max altitude', () => {
      const scale = getZoomScale(10, 0.1, 4.0);
      expect(scale).toBe(POINT_SIZE.MAX_SCALE);
    });
  });

  describe('scatterCrowdedPoints', () => {
    it('should return original position for single point', () => {
      const point = createMockPoint({
        id: '1',
        location: { latitude: 40.7128, longitude: -74.006 },
      });

      const result = scatterCrowdedPoints([point]);

      expect(result.get('1')).toEqual({
        lat: 40.7128,
        lng: -74.006,
      });
    });

    it('should scatter multiple points in same location', () => {
      const points = [
        createMockPoint({ id: '1', location: { latitude: 40, longitude: -74 } }),
        createMockPoint({ id: '2', location: { latitude: 40, longitude: -74 } }),
        createMockPoint({ id: '3', location: { latitude: 40, longitude: -74 } }),
      ];

      const result = scatterCrowdedPoints(points);

      // All points should have positions
      expect(result.size).toBe(3);
      expect(result.has('1')).toBe(true);
      expect(result.has('2')).toBe(true);
      expect(result.has('3')).toBe(true);

      // Positions should be different
      const pos1 = result.get('1')!;
      const pos2 = result.get('2')!;
      const pos3 = result.get('3')!;

      // At least some positions should be different
      const allSame =
        pos1.lat === pos2.lat &&
        pos2.lat === pos3.lat &&
        pos1.lng === pos2.lng &&
        pos2.lng === pos3.lng;

      expect(allSame).toBe(false);
    });

    it('should not scatter points in different grid cells', () => {
      const points = [
        createMockPoint({ id: '1', location: { latitude: 40, longitude: -74 } }),
        createMockPoint({ id: '2', location: { latitude: 50, longitude: -84 } }),
      ];

      const result = scatterCrowdedPoints(points);

      expect(result.get('1')).toEqual({ lat: 40, lng: -74 });
      expect(result.get('2')).toEqual({ lat: 50, lng: -84 });
    });

    it('should handle empty array', () => {
      const result = scatterCrowdedPoints([]);
      expect(result.size).toBe(0);
    });

    it('should keep first point at center when scattering', () => {
      const points = [
        createMockPoint({ id: '1', location: { latitude: 40, longitude: -74 } }),
        createMockPoint({ id: '2', location: { latitude: 40, longitude: -74 } }),
      ];

      const result = scatterCrowdedPoints(points);
      const pos1 = result.get('1')!;

      // First point should be at or very close to center
      expect(Math.abs(pos1.lat - 40)).toBeLessThan(0.01);
      expect(Math.abs(pos1.lng - (-74))).toBeLessThan(0.01);
    });
  });
});

