import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import type { GeoDataPoint, GlobePoint } from '../types/GeoData';
import { globeLogger as logger } from '../utils/logger';
import { EventToast } from './EventToast';

// Zoom configuration
const DEFAULT_ALTITUDE = 2.5;
const MIN_ALTITUDE = 0.1;
const MAX_ALTITUDE = 4.0;

// Auto-rotation pause duration (ms)
const AUTO_ROTATE_PAUSE_MS = 5000;

interface GlobeProps {
  data: GeoDataPoint[];
  pendingEvents?: GeoDataPoint[];
  onPointClick?: (point: GeoDataPoint) => void;
  onPointHover?: (point: GeoDataPoint | null) => void;
  onEventDismiss?: (id: string) => void;
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
  const GRID_SIZE = 0.3; // ~30km grid cells (smaller = more sensitive)
  const SCATTER_RADIUS = 1.0; // Max scatter distance in degrees (~100km)
  
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

export function Globe({ data, pendingEvents = [], onPointClick, onPointHover, onEventDismiss }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const [altitude, setAltitude] = useState(DEFAULT_ALTITUDE);
  const autoRotateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const [eventPositions, setEventPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  /**
   * Convert lat/lng coordinates to screen position
   * Returns null if point is on the back side of the globe (not visible)
   */
  const getScreenPosition = useCallback((lat: number, lng: number): { x: number; y: number } | null => {
    if (!globeRef.current) return null;

    const globe = globeRef.current;
    const camera = globe.camera();
    const renderer = globe.renderer();

    if (!camera || !renderer) return null;

    // Convert lat/lng to 3D position on globe surface
    const GLOBE_RADIUS = 100; // Default globe radius in three-globe
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const position = new THREE.Vector3(
      -GLOBE_RADIUS * Math.sin(phi) * Math.cos(theta),
      GLOBE_RADIUS * Math.cos(phi),
      GLOBE_RADIUS * Math.sin(phi) * Math.sin(theta)
    );

    // Check if point is visible (facing the camera)
    // The point's normal on a sphere is the same as its normalized position
    const pointNormal = position.clone().normalize();
    const cameraDirection = camera.position.clone().normalize();
    
    // Dot product: positive means point faces camera, negative means it's on back side
    const dot = pointNormal.dot(cameraDirection);
    
    if (dot < 0.1) {
      // Point is on the back side or edge of the globe - not visible
      return null;
    }

    // Project to screen coordinates
    const projected = position.clone().project(camera);
    const canvas = renderer.domElement;

    const x = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;

    // Also check if projected point is within screen bounds
    if (x < 0 || x > canvas.clientWidth || y < 0 || y > canvas.clientHeight) {
      return null;
    }

    return { x, y };
  }, []);

  // Update event positions when pendingEvents change or globe moves
  useEffect(() => {
    if (pendingEvents.length === 0) {
      setEventPositions(new Map());
      return;
    }

    const updatePositions = () => {
      const newPositions = new Map<string, { x: number; y: number }>();
      for (const event of pendingEvents) {
        const pos = getScreenPosition(
          event.location.latitude,
          event.location.longitude
        );
        if (pos) {
          newPositions.set(event.id, pos);
        }
      }
      setEventPositions(newPositions);
    };

    // Initial positions
    updatePositions();

    // Update on animation frame while events are showing
    let animationId: number;
    const animate = () => {
      updatePositions();
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [pendingEvents, getScreenPosition]);

  /**
   * Calculate point size multiplier based on zoom level (altitude)
   * When zoomed in (low altitude), points should be smaller
   * When zoomed out (high altitude), points should be larger
   */
  const getZoomAdjustedSize = useCallback((baseSize: number) => {
    // Normalize altitude to 0-1 range
    const normalizedAlt = Math.max(0, Math.min(1, 
      (altitude - MIN_ALTITUDE) / (MAX_ALTITUDE - MIN_ALTITUDE)
    ));
    
    // Scale factor: 0.1 when zoomed in, 1.0 when zoomed out
    const scaleFactor = 0.1 + (normalizedAlt * 0.9);
    
    return baseSize * scaleFactor;
  }, [altitude]);

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

  // Auto-rotate the globe and set up interaction listeners
  useEffect(() => {
    if (globeRef.current) {
      logger.info('Globe initialized');
      
      // Set initial point of view
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
      
      // Enable auto-rotation after initial animation completes
      const initTimeout = setTimeout(() => {
        if (globeRef.current) {
          const controls = globeRef.current.controls();
          if (controls) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.3;
            isInitializedRef.current = true;
            logger.info('Auto-rotation enabled');
            
            // Listen for drag/zoom interactions on the controls
            controls.addEventListener('start', () => {
              if (isInitializedRef.current) {
                // Pause auto-rotation
                controls.autoRotate = false;
                
                // Clear any existing resume timeout
                if (autoRotateTimeoutRef.current) {
                  clearTimeout(autoRotateTimeoutRef.current);
                }
                
                // Schedule resume
                autoRotateTimeoutRef.current = setTimeout(() => {
                  if (globeRef.current) {
                    const ctrl = globeRef.current.controls();
                    if (ctrl) {
                      ctrl.autoRotate = true;
                      logger.debug('Auto-rotation resumed');
                    }
                  }
                }, AUTO_ROTATE_PAUSE_MS);
              }
            });
          }
        }
      }, 1500);
      
      return () => clearTimeout(initTimeout);
    }
  }, []);

  // Pause rotation on user interaction, resume after delay
  const handleInteraction = useCallback(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        // Stop auto-rotation
        controls.autoRotate = false;
        
        // Clear any existing timeout
        if (autoRotateTimeoutRef.current) {
          clearTimeout(autoRotateTimeoutRef.current);
        }
        
        // Resume auto-rotation after delay
        autoRotateTimeoutRef.current = setTimeout(() => {
          if (globeRef.current) {
            const ctrl = globeRef.current.controls();
            if (ctrl) {
              ctrl.autoRotate = true;
              logger.debug('Auto-rotation resumed');
            }
          }
        }, AUTO_ROTATE_PAUSE_MS);
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

  // Handle zoom changes - just track altitude, don't pause rotation
  // (rotation pauses on click/drag via onGlobeClick)
  const handleZoom = useCallback((pov: { lat: number; lng: number; altitude: number }) => {
    setAltitude(pov.altitude);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoRotateTimeoutRef.current) {
        clearTimeout(autoRotateTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
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
        pointRadius={(d: object) => getZoomAdjustedSize((d as GlobePoint).size)}
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
        onZoom={handleZoom}
      />
      
      {/* Event toasts positioned on points */}
      {pendingEvents.map((event) => (
        <EventToast
          key={event.id}
          event={event}
          position={eventPositions.get(event.id) ?? null}
          duration={2000}
          onDismiss={onEventDismiss ?? (() => {})}
        />
      ))}
    </>
  );
}
