import { useRef, useEffect, useMemo, useCallback, useState, memo } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import type { GeoDataPoint, GlobePoint } from '../types/GeoData';
import { globeLogger as logger } from '../utils/logger';
import { EventToast } from './EventToast';

// Throttle helper for expensive calculations
function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let lastCall = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

// Zoom configuration
const DEFAULT_ALTITUDE = 2.5;
const MIN_ALTITUDE = 0.1;
const MAX_ALTITUDE = 4.0;

// Auto-rotation pause duration (ms)
const AUTO_ROTATE_PAUSE_MS = 5000;
const AUTO_ROTATE_HOVER_PAUSE_MS = 1500; // Shorter delay after hover

interface GlobeProps {
  data: GeoDataPoint[];
  pendingEvents?: GeoDataPoint[];
  autoRotate?: boolean;
  dayMode?: boolean;
  onPointClick?: (point: GeoDataPoint) => void;
  onPointHover?: (point: GeoDataPoint | null) => void;
  onEventDismiss?: (id: string) => void;
  onAutoRotateChange?: (enabled: boolean) => void;
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

// Reusable THREE.js objects to avoid allocations in animation loop
const tempVector = new THREE.Vector3();
const tempCameraDir = new THREE.Vector3();

export const Globe = memo(function Globe({ data, pendingEvents = [], autoRotate = true, dayMode = false, onPointClick, onPointHover, onEventDismiss, onAutoRotateChange }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const [altitude, setAltitude] = useState(DEFAULT_ALTITUDE);
  const autoRotateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const autoRotateEnabledRef = useRef(autoRotate); // Track if user has enabled auto-rotate
  const [eventPositions, setEventPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [hoveredGlobePoint, setHoveredGlobePoint] = useState<GlobePoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Cache for expensive calculations
  const lastPositionUpdateRef = useRef<number>(0);
  const POSITION_UPDATE_INTERVAL = 32; // ~30fps for position updates (vs 60fps)

  // Sync autoRotate prop with ref
  useEffect(() => {
    autoRotateEnabledRef.current = autoRotate;
    if (globeRef.current && isInitializedRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = autoRotate;
      }
    }
  }, [autoRotate]);

  /**
   * Convert lat/lng coordinates to screen position using globe.gl's built-in method
   * Returns null if point is on the back side of the globe (not visible)
   * Optimized to reuse THREE.js objects to avoid allocations
   */
  const getScreenPosition = useCallback((lat: number, lng: number): { x: number; y: number } | null => {
    const globe = globeRef.current;
    if (!globe) return null;
    
    // Use globe.gl's built-in screen coordinate conversion
    const screenCoords = globe.getScreenCoords(lat, lng, 0.01);
    if (!screenCoords) return null;
    
    const { x, y } = screenCoords;

    // Check if point is visible by checking if it's on the front side of the globe
    const camera = globe.camera();
    if (!camera) return null;

    // Get the 3D position of the point to check visibility (reuse tempVector)
    const GLOBE_RADIUS = 100;
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    tempVector.set(
      -GLOBE_RADIUS * Math.sin(phi) * Math.cos(theta),
      GLOBE_RADIUS * Math.cos(phi),
      GLOBE_RADIUS * Math.sin(phi) * Math.sin(theta)
    ).normalize();

    // Get camera direction (reuse tempCameraDir)
    tempCameraDir.copy(camera.position).normalize();
    
    // Check if point is facing the camera
    if (tempVector.dot(tempCameraDir) < 0.1) {
      return null; // Point is on the back side
    }

    // Check screen bounds
    const renderer = globe.renderer();
    if (renderer) {
      const canvas = renderer.domElement;
      if (x < 0 || x > canvas.clientWidth || y < 0 || y > canvas.clientHeight) {
        return null;
      }
    }

    return { x, y };
  }, []);

  // Update event positions when pendingEvents change or globe moves
  // Throttled to reduce CPU usage
  useEffect(() => {
    if (pendingEvents.length === 0) {
      setEventPositions(new Map());
      return;
    }

    let animationId: number;
    let isRunning = true;
    
    const updatePositions = () => {
      if (!isRunning) return;
      
      const now = Date.now();
      // Only update every POSITION_UPDATE_INTERVAL ms
      if (now - lastPositionUpdateRef.current >= POSITION_UPDATE_INTERVAL) {
        lastPositionUpdateRef.current = now;
        
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
      }
      
      animationId = requestAnimationFrame(updatePositions);
    };
    
    // Initial positions immediately
    const initialPositions = new Map<string, { x: number; y: number }>();
    for (const event of pendingEvents) {
      const pos = getScreenPosition(event.location.latitude, event.location.longitude);
      if (pos) initialPositions.set(event.id, pos);
    }
    setEventPositions(initialPositions);
    
    // Start animation loop
    animationId = requestAnimationFrame(updatePositions);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationId);
    };
  }, [pendingEvents, getScreenPosition]);

  /**
   * Calculate zoom scale factor based on altitude
   * Memoized to avoid recalculation
   */
  const zoomScaleFactor = useMemo(() => {
    const normalizedAlt = Math.max(0, Math.min(1, 
      (altitude - MIN_ALTITUDE) / (MAX_ALTITUDE - MIN_ALTITUDE)
    ));
    return 0.1 + (normalizedAlt * 0.9);
  }, [altitude]);

  /**
   * Point radius callback - memoized to prevent recreation on every render
   */
  const pointRadiusCallback = useCallback((d: object) => {
    return (d as GlobePoint).size * zoomScaleFactor;
  }, [zoomScaleFactor]);

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
                
                // Schedule resume only if auto-rotate is enabled by user
                autoRotateTimeoutRef.current = setTimeout(() => {
                  if (globeRef.current && autoRotateEnabledRef.current) {
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
        
        // Resume auto-rotation after delay only if enabled by user
        autoRotateTimeoutRef.current = setTimeout(() => {
          if (globeRef.current && autoRotateEnabledRef.current) {
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
      onPointClick?.(globePoint.data);
    },
    [onPointClick, handleInteraction]
  );

  // Handle point hover - pause rotation while hovering
  const handlePointHover = useCallback(
    (point: object | null) => {
      const globePoint = point as GlobePoint | null;
      setHoveredGlobePoint(globePoint);
      onPointHover?.(globePoint?.data || null);

      // Pause/resume auto-rotation based on hover state
      if (globeRef.current) {
        const controls = globeRef.current.controls();
        if (controls && isInitializedRef.current) {
          if (globePoint) {
            // Hovering - stop rotation
            controls.autoRotate = false;
            // Clear any pending resume timeout
            if (autoRotateTimeoutRef.current) {
              clearTimeout(autoRotateTimeoutRef.current);
              autoRotateTimeoutRef.current = null;
            }
          } else {
            // Not hovering - schedule resume after short delay
            if (autoRotateEnabledRef.current) {
              autoRotateTimeoutRef.current = setTimeout(() => {
                if (globeRef.current && autoRotateEnabledRef.current) {
                  const ctrl = globeRef.current.controls();
                  if (ctrl) {
                    ctrl.autoRotate = true;
                    logger.debug('Auto-rotation resumed after hover');
                  }
                }
              }, AUTO_ROTATE_HOVER_PAUSE_MS);
            }
          }
        }
      }
    },
    [onPointHover]
  );

  // Update hover position using the actual globe point coordinates (which may be scattered)
  // Throttled to reduce CPU usage
  useEffect(() => {
    if (!hoveredGlobePoint) {
      setHoverPosition(null);
      return;
    }

    let animationId: number;
    let isRunning = true;
    let lastUpdate = 0;
    
    const updatePosition = () => {
      if (!isRunning) return;
      
      const now = Date.now();
      if (now - lastUpdate >= POSITION_UPDATE_INTERVAL) {
        lastUpdate = now;
        const pos = getScreenPosition(hoveredGlobePoint.lat, hoveredGlobePoint.lng);
        setHoverPosition(pos);
      }
      
      animationId = requestAnimationFrame(updatePosition);
    };

    // Initial position immediately
    setHoverPosition(getScreenPosition(hoveredGlobePoint.lat, hoveredGlobePoint.lng));
    animationId = requestAnimationFrame(updatePosition);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationId);
    };
  }, [hoveredGlobePoint, getScreenPosition]);

  // Handle zoom changes - adjust rotation speed based on altitude
  const handleZoom = useCallback((pov: { lat: number; lng: number; altitude: number }) => {
    setAltitude(pov.altitude);
    
    // Adjust auto-rotate speed based on zoom level
    // Slower when zoomed in, faster when zoomed out
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        // Normalize altitude to 0-1 range
        const normalizedAlt = Math.max(0, Math.min(1, 
          (pov.altitude - MIN_ALTITUDE) / (MAX_ALTITUDE - MIN_ALTITUDE)
        ));
        // Speed: 0.1 when fully zoomed in, 0.5 when fully zoomed out
        controls.autoRotateSpeed = 0.1 + (normalizedAlt * 0.4);
      }
    }
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
        globeImageUrl={dayMode ? "/textures/earth-day.jpg" : "/textures/earth-night.jpg"}
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        bumpImageUrl="/textures/earth-topology.png"
        // Points configuration
        pointsData={globePoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.01}
        pointRadius={pointRadiusCallback}
        pointColor="color"
        pointLabel={() => ''} // Disable default tooltip, we use EventToast instead
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

      {/* Hover toast */}
      {hoveredGlobePoint && hoverPosition && (
        <EventToast
          key={`hover-${hoveredGlobePoint.data.id}`}
          event={hoveredGlobePoint.data}
          position={hoverPosition}
          isHover={true}
        />
      )}
    </>
  );
});
