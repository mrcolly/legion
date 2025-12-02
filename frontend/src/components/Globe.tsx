/**
 * 3D Globe component for displaying geo-located data points
 */

import { useRef, useEffect, useMemo, useCallback, useState, memo } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import type { GeoDataPoint, GlobePoint } from '../types/GeoData';
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
  onPointClick,
  onPointHover,
  onEventDismiss,
}: GlobeProps) {
  // Refs
  const globeRef = useRef<any>(null);
  const autoRotateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const autoRotateEnabledRef = useRef(autoRotate);
  const lastPositionUpdateRef = useRef(0);
  
  // Cache for stable globe point references (prevents re-animation)
  const pointsCacheRef = useRef<Map<string, GlobePoint>>(new Map());

  // State
  const [altitude, setAltitude] = useState(GLOBE.DEFAULT_ALTITUDE);
  const [eventPositions, setEventPositions] = useState<Map<string, ScreenPosition>>(new Map());
  const [hoveredGlobePoint, setHoveredGlobePoint] = useState<GlobePoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<ScreenPosition | null>(null);

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

  const pointRadiusCallback = useCallback(
    (d: object) => (d as GlobePoint).size * zoomScaleFactor,
    [zoomScaleFactor]
  );

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
  }, [data]);

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
    if (typeof globe.pointTransitionDuration === 'function') {
      globe.pointTransitionDuration(0);
    }
    
    globe.pointOfView(
      { lat: GLOBE.INITIAL_LAT, lng: GLOBE.INITIAL_LNG, altitude: GLOBE.DEFAULT_ALTITUDE },
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
  }, [pauseAutoRotate, scheduleAutoRotateResume]);

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
  // Cleanup
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (autoRotateTimeoutRef.current) {
        clearTimeout(autoRotateTimeoutRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <GlobeGL
        ref={globeRef}
        globeImageUrl={dayMode ? TEXTURES.EARTH_DAY : TEXTURES.EARTH_NIGHT}
        backgroundImageUrl={TEXTURES.BACKGROUND}
        bumpImageUrl={TEXTURES.EARTH_BUMP}
        pointsData={globePoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={GLOBE.POINT_ALTITUDE}
        pointRadius={pointRadiusCallback}
        pointColor="color"
        pointLabel={() => ''}
        pointResolution={GLOBE.POINT_RESOLUTION}
        pointTransitionDuration={0}
        onPointClick={handlePointClick}
        onPointHover={handlePointHover}
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
    </>
  );
});
