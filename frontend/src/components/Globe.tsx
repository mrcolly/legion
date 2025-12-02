import { useRef, useEffect, useMemo, useCallback } from 'react';
import GlobeGL from 'react-globe.gl';
import type { GeoDataPoint, GlobePoint } from '../types/GeoData';

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

export function Globe({ data, onPointClick, onPointHover }: GlobeProps) {
  const globeRef = useRef<any>(null);

  // Transform data to globe point format
  const globePoints: GlobePoint[] = useMemo(() => {
    return data.map((point) => ({
      lat: point.location.latitude,
      lng: point.location.longitude,
      size: getPointSize(point),
      color: getPointColor(point),
      label: point.title,
      data: point,
    }));
  }, [data]);

  // Auto-rotate the globe
  useEffect(() => {
    if (globeRef.current) {
      // Set initial point of view
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
      
      // Enable auto-rotation
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;
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
    (point: GlobePoint) => {
      handleInteraction();
      
      // Fly to point
      if (globeRef.current) {
        globeRef.current.pointOfView(
          { lat: point.lat, lng: point.lng, altitude: 1.5 },
          1000
        );
      }
      
      onPointClick?.(point.data);
    },
    [onPointClick, handleInteraction]
  );

  // Handle point hover
  const handlePointHover = useCallback(
    (point: GlobePoint | null) => {
      onPointHover?.(point?.data || null);
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
