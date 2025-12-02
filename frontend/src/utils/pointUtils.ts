/**
 * Utilities for globe point styling and positioning
 */

import type { GeoDataPoint } from '../types/GeoData';
import { COLORS, POINT_SIZE, SCATTER } from '../constants';

/**
 * Get color for a data point based on source and category
 */
export function getPointColor(point: GeoDataPoint): string {
  if (point.source && COLORS.SOURCE[point.source]) {
    return COLORS.SOURCE[point.source];
  }
  if (point.category && COLORS.CATEGORY[point.category]) {
    return COLORS.CATEGORY[point.category];
  }
  return COLORS.CATEGORY.default;
}

/**
 * Get point size with slight variation for visual interest
 */
export function getPointSize(point: GeoDataPoint): number {
  const variation = (point.id.codePointAt(0) ?? 0) % 10 / 20;
  return POINT_SIZE.BASE + variation;
}

/**
 * Calculate zoom-adjusted size multiplier
 * Smaller when zoomed in, larger when zoomed out
 */
export function getZoomScale(
  altitude: number,
  minAlt: number,
  maxAlt: number
): number {
  const normalized = Math.max(0, Math.min(1, (altitude - minAlt) / (maxAlt - minAlt)));
  return POINT_SIZE.MIN_SCALE + normalized * (POINT_SIZE.MAX_SCALE - POINT_SIZE.MIN_SCALE);
}

interface ScatteredPosition {
  lat: number;
  lng: number;
}

/**
 * Scatter crowded points to make them visible
 * Points within the same grid cell get offset in a spiral pattern
 */
export function scatterCrowdedPoints(
  points: GeoDataPoint[]
): Map<string, ScatteredPosition> {
  // Group points by grid cell
  const gridCells = new Map<string, GeoDataPoint[]>();

  for (const point of points) {
    const cellX = Math.floor(point.location.longitude / SCATTER.GRID_SIZE);
    const cellY = Math.floor(point.location.latitude / SCATTER.GRID_SIZE);
    const cellKey = `${cellX},${cellY}`;

    if (!gridCells.has(cellKey)) {
      gridCells.set(cellKey, []);
    }
    gridCells.get(cellKey)!.push(point);
  }

  // Calculate scattered positions
  const scatteredPositions = new Map<string, ScatteredPosition>();

  for (const [, cellPoints] of gridCells) {
    if (cellPoints.length === 1) {
      // Single point - no scattering needed
      const p = cellPoints[0];
      scatteredPositions.set(p.id, {
        lat: p.location.latitude,
        lng: p.location.longitude,
      });
    } else {
      // Multiple points - scatter in spiral pattern
      const centerLat =
        cellPoints.reduce((sum, p) => sum + p.location.latitude, 0) /
        cellPoints.length;
      const centerLng =
        cellPoints.reduce((sum, p) => sum + p.location.longitude, 0) /
        cellPoints.length;

      cellPoints.forEach((point, index) => {
        if (index === 0) {
          // First point stays at center
          scatteredPositions.set(point.id, { lat: centerLat, lng: centerLng });
        } else {
          // Spiral pattern using golden angle
          const angle = (index * SCATTER.GOLDEN_ANGLE * Math.PI) / 180;
          const radius = SCATTER.RADIUS * Math.sqrt(index / cellPoints.length);

          scatteredPositions.set(point.id, {
            lat: centerLat + radius * Math.sin(angle),
            lng: centerLng + radius * Math.cos(angle),
          });
        }
      });
    }
  }

  return scatteredPositions;
}
