/**
 * 3D Globe component for displaying geo-located data points
 */

import { useRef, useEffect, useMemo, useCallback, useState, memo } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import type { GeoDataPoint, GlobePoint, MovingObject } from '../types/GeoData';
import { globeLogger as logger } from '../utils/logger';
import { EventToast } from './EventToast';
import { getPointColor, getPointSize, getZoomScale, scatterCrowdedPoints } from '../utils/pointUtils';
import { GLOBE, AUTO_ROTATE, COLORS, TEXTURES, PERFORMANCE } from '../constants';

// =============================================================================
// Types
// =============================================================================

interface GlobeProps {
  data: GeoDataPoint[];
  pendingEvents?: GeoDataPoint[];
  autoRotate?: boolean;
  dayMode?: boolean;
  movingObjects?: MovingObject[];
  onPointClick?: (point: GeoDataPoint) => void;
  onPointHover?: (point: GeoDataPoint | null) => void;
  onEventDismiss?: (id: string) => void;
}

interface ScreenPosition {
  x: number;
  y: number;
}

// =============================================================================
// Reusable THREE.js objects (avoid allocations in animation loop)
// =============================================================================

const tempVector = new THREE.Vector3();
const tempCameraDir = new THREE.Vector3();

// =============================================================================
// Component
// =============================================================================

export const Globe = memo(function Globe({
  data,
  pendingEvents = [],
  autoRotate = true,
  dayMode = false,
  movingObjects = [],
  onPointClick,
  onPointHover,
  onEventDismiss,
}: GlobeProps) {
  // Refs
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const autoRotateEnabledRef = useRef(autoRotate);
  const lastPositionUpdateRef = useRef(0);
  
  // Cache for stable globe point references (prevents re-animation)
  const pointsCacheRef = useRef<Map<string, GlobePoint>>(new Map());

  // State
  const [altitude, setAltitude] = useState<number>(GLOBE.DEFAULT_ALTITUDE);
  const [dimensions, setDimensions] = useState({ width: globalThis.innerWidth, height: globalThis.innerHeight });
  const [eventPositions, setEventPositions] = useState<Map<string, ScreenPosition>>(new Map());
  const [hoveredGlobePoint, setHoveredGlobePoint] = useState<GlobePoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<ScreenPosition | null>(null);

  // ---------------------------------------------------------------------------
  // Handle window resize
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      });
    };

    globalThis.addEventListener('resize', handleResize);
    // Also handle orientation change on mobile
    globalThis.addEventListener('orientationchange', () => {
      // Delay to let the browser settle
      setTimeout(handleResize, 100);
    });

    return () => {
      globalThis.removeEventListener('resize', handleResize);
      globalThis.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Calculate responsive altitude (zoom out more on smaller screens)
  const responsiveAltitude = useMemo(() => {
    const minDimension = Math.min(dimensions.width, dimensions.height);
    // On very small screens (< 400px), zoom out more to see the whole globe
    if (minDimension < 400) {
      return GLOBE.DEFAULT_ALTITUDE + 1;
    }
    // On small screens (< 600px), zoom out a bit
    if (minDimension < 600) {
      return GLOBE.DEFAULT_ALTITUDE + 0.5;
    }
    return GLOBE.DEFAULT_ALTITUDE;
  }, [dimensions]);

  // ---------------------------------------------------------------------------
  // Sync autoRotate prop with ref and controls
  // ---------------------------------------------------------------------------
  useEffect(() => {
    autoRotateEnabledRef.current = autoRotate;
    if (globeRef.current && isInitializedRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = autoRotate;
      }
    }
  }, [autoRotate]);

  // ---------------------------------------------------------------------------
  // Screen position calculation
  // ---------------------------------------------------------------------------
  const getScreenPosition = useCallback(
    (lat: number, lng: number): ScreenPosition | null => {
      const globe = globeRef.current;
      if (!globe) return null;

      const screenCoords = globe.getScreenCoords(lat, lng, GLOBE.POINT_ALTITUDE);
      if (!screenCoords) return null;

      const { x, y } = screenCoords;
      const camera = globe.camera();
      if (!camera) return null;

      // Check visibility (front side of globe)
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);

      tempVector
        .set(
          -GLOBE.RADIUS * Math.sin(phi) * Math.cos(theta),
          GLOBE.RADIUS * Math.cos(phi),
          GLOBE.RADIUS * Math.sin(phi) * Math.sin(theta)
        )
        .normalize();

      tempCameraDir.copy(camera.position).normalize();

      if (tempVector.dot(tempCameraDir) < 0.1) {
        return null; // Back side
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
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Update event positions (throttled animation loop)
  // ---------------------------------------------------------------------------
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
      if (now - lastPositionUpdateRef.current >= PERFORMANCE.POSITION_UPDATE_INTERVAL) {
        lastPositionUpdateRef.current = now;

        const newPositions = new Map<string, ScreenPosition>();
        for (const event of pendingEvents) {
          const pos = getScreenPosition(event.location.latitude, event.location.longitude);
          if (pos) newPositions.set(event.id, pos);
        }
        setEventPositions(newPositions);
      }

      animationId = requestAnimationFrame(updatePositions);
    };

    // Initial positions
    const initial = new Map<string, ScreenPosition>();
    for (const event of pendingEvents) {
      const pos = getScreenPosition(event.location.latitude, event.location.longitude);
      if (pos) initial.set(event.id, pos);
    }
    setEventPositions(initial);

    animationId = requestAnimationFrame(updatePositions);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationId);
    };
  }, [pendingEvents, getScreenPosition]);

  // ---------------------------------------------------------------------------
  // Update hover position (throttled animation loop) - position is already set in handlePointHover
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hoveredGlobePoint) {
      return; // Position already cleared in handlePointHover
    }

    let animationId: number;
    let isRunning = true;
    let lastUpdate = Date.now(); // Start from now since initial position is already set

    const updatePosition = () => {
      if (!isRunning) return;

      const now = Date.now();
      if (now - lastUpdate >= PERFORMANCE.POSITION_UPDATE_INTERVAL) {
        lastUpdate = now;
        setHoverPosition(getScreenPosition(hoveredGlobePoint.lat, hoveredGlobePoint.lng));
      }

      animationId = requestAnimationFrame(updatePosition);
    };

    // Don't set initial position here - already done in handlePointHover
    animationId = requestAnimationFrame(updatePosition);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationId);
    };
  }, [hoveredGlobePoint, getScreenPosition]);

  // ---------------------------------------------------------------------------
  // Zoom scale factor (memoized)
  // ---------------------------------------------------------------------------
  const zoomScaleFactor = useMemo(
    () => getZoomScale(altitude, GLOBE.MIN_ALTITUDE, GLOBE.MAX_ALTITUDE),
    [altitude]
  );

  // ---------------------------------------------------------------------------
  // Moving objects with smooth interpolation
  // ---------------------------------------------------------------------------
  
  // Store ALL moving object state in ref (not in the data array that globe.gl sees)
  const movingObjectStateRef = useRef<Map<string, {
    lat: number;
    lng: number;
    latPerSec: number;
    lngPerSec: number;
    lastFrameTime: number;
    color: string;
  }>>(new Map());

  // Update state when new positions arrive (but don't change movingObjectsData)
  useEffect(() => {
    const state = movingObjectStateRef.current;
    
    for (const obj of movingObjects) {
      const existing = state.get(obj.id);
      
      if (obj.positions.length >= 2) {
        const pos1 = obj.positions.at(-2)!;
        const pos2 = obj.positions.at(-1)!;
        
        const time1 = new Date(pos1.timestamp).getTime();
        const time2 = new Date(pos2.timestamp).getTime();
        const deltaSeconds = (time2 - time1) / 1000;
        
        if (deltaSeconds > 0) {
          let latPerSec = (pos2.latitude - pos1.latitude) / deltaSeconds;
          let lngPerSec = (pos2.longitude - pos1.longitude) / deltaSeconds;
          
          // Handle longitude wrap-around
          if (Math.abs(pos2.longitude - pos1.longitude) > 180) {
            lngPerSec = pos2.longitude > pos1.longitude
              ? (pos2.longitude - pos1.longitude - 360) / deltaSeconds
              : (pos2.longitude - pos1.longitude + 360) / deltaSeconds;
          }
          
          if (existing) {
            // Just update velocity, keep current interpolated position
            existing.latPerSec = latPerSec;
            existing.lngPerSec = lngPerSec;
          } else {
            // New object - initialize
            state.set(obj.id, {
              lat: pos2.latitude,
              lng: pos2.longitude,
              latPerSec,
              lngPerSec,
              lastFrameTime: Date.now(),
              color: obj.color || '#00ff88',
            });
          }
        }
      } else if (obj.positions.length === 1 && !existing) {
        const pos = obj.positions[0];
        state.set(obj.id, {
          lat: pos.latitude,
          lng: pos.longitude,
          latPerSec: 0,
          lngPerSec: 0,
          lastFrameTime: Date.now(),
          color: obj.color || '#00ff88',
        });
      }
    }
    
    // Cleanup
    const ids = new Set(movingObjects.map(o => o.id));
    for (const id of state.keys()) {
      if (!ids.has(id)) state.delete(id);
    }
  }, [movingObjects]);

  // Moving objects data for custom layer (with interpolated positions)
  const [movingObjectsRenderData, setMovingObjectsRenderData] = useState<Array<{
    id: string;
    lat: number;
    lng: number;
    alt: number;
    color: string;
    name: string;
    type: string;
  }>>([]);

  // Update moving objects positions - throttled to avoid re-render loops
  useEffect(() => {
    if (movingObjects.length === 0) {
      setMovingObjectsRenderData([]);
      return;
    }

    const UPDATE_INTERVAL = 1000; // Update every 1 second (slower to avoid click issues)
    
    const updatePositions = () => {
      const now = Date.now();
      const data: typeof movingObjectsRenderData = [];

      for (const [id, state] of movingObjectStateRef.current.entries()) {
        const deltaSec = (now - state.lastFrameTime) / 1000;

        // Update position incrementally
        if (deltaSec > 0 && deltaSec < 5) {
          state.lat += state.latPerSec * deltaSec;
          state.lng += state.lngPerSec * deltaSec;

          // Clamp latitude
          state.lat = Math.max(-90, Math.min(90, state.lat));

          // Wrap longitude
          if (state.lng > 180) state.lng -= 360;
          if (state.lng < -180) state.lng += 360;
        }
        state.lastFrameTime = now;

        // Find the original object for metadata
        const obj = movingObjects.find(o => o.id === id);
        if (obj) {
          data.push({
            id,
            lat: state.lat,
            lng: state.lng,
            alt: 0.05,
            color: state.color,
            name: obj.name,
            type: obj.type,
          });
        }
      }

      setMovingObjectsRenderData(data);
    };

    // Initial update
    updatePositions();

    // Set up interval for subsequent updates
    const intervalId = setInterval(updatePositions, UPDATE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [movingObjects]);

  // ---------------------------------------------------------------------------
  // Transform data to globe points (with stable references to prevent re-animation)
  // ---------------------------------------------------------------------------
  const globePoints: GlobePoint[] = useMemo(() => {
    logger.debug({ pointCount: data.length }, 'Transforming data to globe points');

    const scatteredPositions = scatterCrowdedPoints(data);
    const cache = pointsCacheRef.current;
    const currentIds = new Set<string>();
    const result: GlobePoint[] = [];

    for (const point of data) {
      const id = point.hash || point.id;
      currentIds.add(id);

      // Check if we already have this point cached
      let globePoint = cache.get(id);

      if (!globePoint) {
        // New point - create and cache it
        const position = scatteredPositions.get(point.id) || {
          lat: point.location.latitude,
          lng: point.location.longitude,
        };

        globePoint = {
          lat: position.lat,
          lng: position.lng,
          size: getPointSize(point),
          color: getPointColor(point),
          label: point.title,
          data: point,
        };
        cache.set(id, globePoint);
      }

      result.push(globePoint);
    }

    // Clean up old points from cache
    for (const id of cache.keys()) {
      if (!currentIds.has(id)) {
        cache.delete(id);
      }
    }

    return result;
  }, [data, movingObjects]);

  // ---------------------------------------------------------------------------
  // Auto-rotation helpers
  // ---------------------------------------------------------------------------
  const scheduleAutoRotateResume = useCallback((delay: number) => {
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }

    autoRotateTimeoutRef.current = setTimeout(() => {
      if (globeRef.current && autoRotateEnabledRef.current) {
        const controls = globeRef.current.controls();
        if (controls) {
          controls.autoRotate = true;
          logger.debug('Auto-rotation resumed');
        }
      }
    }, delay);
  }, []);

  const pauseAutoRotate = useCallback(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = false;
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Initialize globe
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!globeRef.current) return;

    logger.info('Globe initialized');
    
    // Disable point transition animations to prevent "growing" effect
    // Access the underlying globe.gl instance
    const globe = globeRef.current;
    if (typeof globe.pointsTransitionDuration === 'function') {
      globe.pointsTransitionDuration(0);
    }
    
    globe.pointOfView(
      { lat: GLOBE.INITIAL_LAT, lng: GLOBE.INITIAL_LNG, altitude: responsiveAltitude },
      GLOBE.ANIMATION_DURATION
    );

    const initTimeout = setTimeout(() => {
      if (!globeRef.current) return;

      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = AUTO_ROTATE.DEFAULT_SPEED;
        isInitializedRef.current = true;
        logger.info('Auto-rotation enabled');

        controls.addEventListener('start', () => {
          if (isInitializedRef.current) {
            pauseAutoRotate();
            scheduleAutoRotateResume(AUTO_ROTATE.PAUSE_DURATION);
          }
        });
      }
    }, AUTO_ROTATE.INIT_DELAY);

    return () => clearTimeout(initTimeout);
  }, [pauseAutoRotate, scheduleAutoRotateResume, responsiveAltitude]);

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------
  const handleInteraction = useCallback(() => {
    pauseAutoRotate();
    scheduleAutoRotateResume(AUTO_ROTATE.PAUSE_DURATION);
  }, [pauseAutoRotate, scheduleAutoRotateResume]);

  const handlePointClick = useCallback(
    (point: object) => {
      const globePoint = point as GlobePoint;
      logger.info({ title: globePoint.data.title, lat: globePoint.lat, lng: globePoint.lng }, 'Point clicked');
      handleInteraction();
      onPointClick?.(globePoint.data);
    },
    [onPointClick, handleInteraction]
  );

  const handlePointHover = useCallback(
    (point: object | null) => {
      const globePoint = point as GlobePoint | null;
      
      // Calculate position IMMEDIATELY before setting state to avoid flash
      if (globePoint) {
        const pos = getScreenPosition(globePoint.lat, globePoint.lng);
        setHoverPosition(pos);
      } else {
        setHoverPosition(null);
      }
      
      setHoveredGlobePoint(globePoint);
      onPointHover?.(globePoint?.data || null);

      if (!globeRef.current || !isInitializedRef.current) return;

      const controls = globeRef.current.controls();
      if (!controls) return;

      if (globePoint) {
        pauseAutoRotate();
        if (autoRotateTimeoutRef.current) {
          clearTimeout(autoRotateTimeoutRef.current);
          autoRotateTimeoutRef.current = null;
        }
      } else if (autoRotateEnabledRef.current) {
        scheduleAutoRotateResume(AUTO_ROTATE.HOVER_PAUSE_DURATION);
      }
    },
    [onPointHover, pauseAutoRotate, scheduleAutoRotateResume, getScreenPosition]
  );


  const handleZoom = useCallback(
    (pov: { lat: number; lng: number; altitude: number }) => {
      setAltitude(pov.altitude);

      if (globeRef.current) {
        const controls = globeRef.current.controls();
        if (controls) {
          const normalized = Math.max(
            0,
            Math.min(1, (pov.altitude - GLOBE.MIN_ALTITUDE) / (GLOBE.MAX_ALTITUDE - GLOBE.MIN_ALTITUDE))
          );
          controls.autoRotateSpeed = AUTO_ROTATE.MIN_SPEED + normalized * (AUTO_ROTATE.MAX_SPEED - AUTO_ROTATE.MIN_SPEED);
        }
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Trajectory lines (rendered directly in THREE.js scene)
  // ---------------------------------------------------------------------------
  const trajectoryLinesRef = useRef<Map<string, THREE.Line>>(new Map());

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const scene = globe.scene();
    if (!scene) return;

    const existingIds = new Set<string>();

    for (const obj of movingObjects) {
      if (obj.positions.length < 2) continue;
      
      existingIds.add(obj.id);
      let line = trajectoryLinesRef.current.get(obj.id);

      // Create line if it doesn't exist
      if (!line) {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
        });
        line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        scene.add(line);
        trajectoryLinesRef.current.set(obj.id, line);
      }

      // Update line positions and colors (reversed: newest first, oldest last)
      const positions: number[] = [];
      const colors: number[] = [];
      const trailAltitude = 0.05; // Same as object altitude
      const baseColor = new THREE.Color(obj.color || '#00ff88');
      const numPoints = obj.positions.length;

      // Reverse order: start from newest (near object) to oldest (faded end)
      for (let i = numPoints - 1; i >= 0; i--) {
        const pos = obj.positions[i];
        const coords = globe.getCoords(pos.latitude, pos.longitude, trailAltitude);
        if (coords) {
          positions.push(coords.x, coords.y, coords.z);
          
          // Fade: start (newest, near object) is bright, end (oldest) fades away
          const fade = i / (numPoints - 1); // 1 at newest, 0 at oldest
          colors.push(baseColor.r * fade, baseColor.g * fade, baseColor.b * fade);
        }
      }

      if (positions.length >= 6) { // At least 2 points
        const geometry = line.geometry as THREE.BufferGeometry;
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      }
    }

    // Remove lines for objects that no longer exist
    for (const [id, line] of trajectoryLinesRef.current.entries()) {
      if (!existingIds.has(id)) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        trajectoryLinesRef.current.delete(id);
      }
    }
  }, [movingObjects]);

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (autoRotateTimeoutRef.current) {
        clearTimeout(autoRotateTimeoutRef.current);
      }
      // Clean up trajectory lines
      const globe = globeRef.current;
      if (globe) {
        const scene = globe.scene();
        for (const line of trajectoryLinesRef.current.values()) {
          scene?.remove(line);
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        }
      }
      trajectoryLinesRef.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GlobeGL
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl={dayMode ? TEXTURES.EARTH_DAY : TEXTURES.EARTH_NIGHT}
        backgroundImageUrl={TEXTURES.BACKGROUND}
        bumpImageUrl={TEXTURES.EARTH_BUMP}
        // Data points
        pointsData={globePoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={GLOBE.POINT_ALTITUDE}
        pointRadius={(d: object) => (d as GlobePoint).size * zoomScaleFactor}
        pointColor="color"
        pointLabel={() => ''}
        pointResolution={GLOBE.POINT_RESOLUTION}
        pointsTransitionDuration={0}
        onPointClick={handlePointClick}
        onPointHover={handlePointHover}
        // Moving objects (satellites) using objects layer
        objectsData={movingObjectsRenderData}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="alt"
        objectThreeObject={(d: any) => {
          const color = new THREE.Color(d.color || '#00ff88');
          const geometry = new THREE.SphereGeometry(0.5, 16, 16);
          const material = new THREE.MeshBasicMaterial({ 
            color,
            transparent: true,
            opacity: 0.9,
          });
          return new THREE.Mesh(geometry, material);
        }}
        objectLabel={() => ''}
        onObjectClick={(obj: any) => {
          try {
            if (obj && typeof obj === 'object' && obj.id) {
              handleInteraction();
              const point: GeoDataPoint = {
                id: obj.id,
                title: obj.name || 'Unknown',
                description: `Type: ${obj.type || 'unknown'}`,
                source: 'Satellite Tracking',
                timestamp: new Date().toISOString(),
                location: { latitude: obj.lat || 0, longitude: obj.lng || 0 },
              };
              onPointClick?.(point);
            }
          } catch {
            // Ignore click errors
          }
        }}
        onObjectHover={(obj: any) => {
          if (obj) {
            pauseAutoRotate();
            if (autoRotateTimeoutRef.current) {
              clearTimeout(autoRotateTimeoutRef.current);
              autoRotateTimeoutRef.current = null;
            }
          } else {
            if (autoRotateEnabledRef.current) {
              scheduleAutoRotateResume(AUTO_ROTATE.HOVER_PAUSE_DURATION);
            }
          }
        }}
        // Globe settings
        atmosphereColor={COLORS.ATMOSPHERE}
        atmosphereAltitude={0.25}
        animateIn={true}
        onGlobeClick={handleInteraction}
        onZoom={handleZoom}
      />

      {/* Event toasts */}
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

    </div>
  );
});
