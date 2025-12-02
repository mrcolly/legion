import { useRef, useEffect, useMemo, useCallback } from 'react';
import GlobeGL from 'react-globe.gl';
import type { GeoDataPoint, GlobePoint } from '../types/GeoData';
import { globeLogger as logger } from '../utils/logger';

interface GlobeProps {
  data: GeoDataPoint[];
  onPointClick?: (point: GeoDataPoint) => void;
  onPointHover?: (point: GeoDataPoint | null) => void;
}

// Color mapping by source/category
const SOURCE_COLORS: Record<string, string> = {
  GDELT: '#ff6b6b',
  Demo: '#4ecdc4',
  default: '#ffe66d',
};

const CATEGORY_COLORS: Record<string, string> = {
  news: '#ff6b6b',
  event: '#4ecdc4',
  demo: '#ffe66d',
  default: '#95e1d3',
};

/**
 * Get color for a data point based on source and category
 */
function getPointColor(point: GeoDataPoint): string {
  if (point.source && SOURCE_COLORS[point.source]) {
    return SOURCE_COLORS[point.source];
  }
  if (point.category && CATEGORY_COLORS[point.category]) {
    return CATEGORY_COLORS[point.category];
  }
  return CATEGORY_COLORS.default;
}

/**
 * Get point size based on metadata or default
 */
function getPointSize(point: GeoDataPoint): number {
  // Vary size slightly for visual interest
  const base = 0.4;
  const variation = (point.id.charCodeAt(0) % 10) / 20; // 0 to 0.5
  return base + variation;
}

/**
 * Scatter crowded points to make them visible
 * Points within the same grid cell get offset in a spiral pattern
 */
function scatterCrowdedPoints(points: GeoDataPoint[]): Map<string, { lat: number; lng: number }> {
  const GRID_SIZE = 0.5; // ~50km grid cells
  const SCATTER_RADIUS = 0.3; // Max scatter distance in degrees
  
  // Group points by grid cell
  const gridCells = new Map<string, GeoDataPoint[]>();
  
  for (const point of points) {
    const cellX = Math.floor(point.location.longitude / GRID_SIZE);
    const cellY = Math.floor(point.location.latitude / GRID_SIZE);
    const cellKey = `${cellX},${cellY}`;
    
    if (!gridCells.has(cellKey)) {
      gridCells.set(cellKey, []);
    }
    gridCells.get(cellKey)!.push(point);
  }
  
  // Calculate scattered positions
  const scatteredPositions = new Map<string, { lat: number; lng: number }>();
  
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
      const centerLat = cellPoints.reduce((sum, p) => sum + p.location.latitude, 0) / cellPoints.length;
      const centerLng = cellPoints.reduce((sum, p) => sum + p.location.longitude, 0) / cellPoints.length;
      
      cellPoints.forEach((point, index) => {
        if (index === 0) {
          // First point stays at center
          scatteredPositions.set(point.id, { lat: centerLat, lng: centerLng });
        } else {
          // Spiral pattern for others
          const angle = (index * 137.5 * Math.PI) / 180; // Golden angle for even distribution
          const radius = SCATTER_RADIUS * Math.sqrt(index / cellPoints.length);
          
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

export function Globe({ data, onPointClick, onPointHover }: GlobeProps) {
  const globeRef = useRef<any>(null);

  // Transform data to globe point format with scatter for crowded points
  const globePoints: GlobePoint[] = useMemo(() => {
    logger.debug({ pointCount: data.length }, 'Transforming data to globe points');
    
    // Calculate scattered positions for crowded points
    const scatteredPositions = scatterCrowdedPoints(data);
    
    return data.map((point) => {
      const position = scatteredPositions.get(point.id) || {
        lat: point.location.latitude,
        lng: point.location.longitude,
      };
      
      return {
        lat: position.lat,
        lng: position.lng,
        size: getPointSize(point),
        color: getPointColor(point),
        label: point.title,
        data: point,
      };
    });
  }, [data]);

  // Auto-rotate the globe
  useEffect(() => {
    if (globeRef.current) {
      logger.info('Globe initialized');
      
      // Set initial point of view
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
      
      // Enable auto-rotation
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;
        logger.debug('Auto-rotation enabled');
      }
    }
  }, []);

  // Stop rotation on user interaction
  const handleInteraction = useCallback(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = false;
      }
    }
  }, []);

  // Handle point click
  const handlePointClick = useCallback(
    (point: object) => {
      const globePoint = point as GlobePoint;
      logger.info({ 
        title: globePoint.data.title, 
        lat: globePoint.lat, 
        lng: globePoint.lng 
      }, 'Point clicked');
      
      handleInteraction();
      
      // Fly to point
      if (globeRef.current) {
        globeRef.current.pointOfView(
          { lat: globePoint.lat, lng: globePoint.lng, altitude: 1.5 },
          1000
        );
      }
      
      onPointClick?.(globePoint.data);
    },
    [onPointClick, handleInteraction]
  );

  // Handle point hover
  const handlePointHover = useCallback(
    (point: object | null) => {
      const globePoint = point as GlobePoint | null;
      onPointHover?.(globePoint?.data || null);
    },
    [onPointHover]
  );

  return (
    <GlobeGL
      ref={globeRef}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
      // Points configuration
      pointsData={globePoints}
      pointLat="lat"
      pointLng="lng"
      pointAltitude={0.01}
      pointRadius="size"
      pointColor="color"
      pointLabel={(d: any) => {
        const point = d as GlobePoint;
        return `
          <div class="globe-tooltip">
            <strong>${point.data.title}</strong>
            <br/>
            <small>${point.data.source}</small>
            ${point.data.description ? `<br/><em>${point.data.description.substring(0, 100)}...</em>` : ''}
          </div>
        `;
      }}
      pointResolution={12}
      onPointClick={handlePointClick}
      onPointHover={handlePointHover}
      // Atmosphere
      atmosphereColor="#3a228a"
      atmosphereAltitude={0.25}
      // Performance
      animateIn={true}
      // Interactivity
      onGlobeClick={handleInteraction}
    />
  );
}
