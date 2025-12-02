/**
 * Application constants
 * Centralized configuration values
 */

// =============================================================================
// Globe Configuration
// =============================================================================

export const GLOBE = {
  /** Default camera altitude */
  DEFAULT_ALTITUDE: 2.5,
  /** Minimum zoom (closest) */
  MIN_ALTITUDE: 0.1,
  /** Maximum zoom (furthest) */
  MAX_ALTITUDE: 4.0,
  /** Globe radius for calculations */
  RADIUS: 100,
  /** Point altitude above globe surface */
  POINT_ALTITUDE: 0.01,
  /** Point geometry resolution */
  POINT_RESOLUTION: 12,
  /** Initial camera latitude */
  INITIAL_LAT: 20,
  /** Initial camera longitude */
  INITIAL_LNG: 0,
  /** Animation duration for camera moves (ms) */
  ANIMATION_DURATION: 1000,
} as const;

// =============================================================================
// Auto-Rotation Configuration
// =============================================================================

export const AUTO_ROTATE = {
  /** Delay before resuming after interaction (ms) */
  PAUSE_DURATION: 5000,
  /** Delay before resuming after hover (ms) */
  HOVER_PAUSE_DURATION: 1500,
  /** Delay before enabling after init (ms) */
  INIT_DELAY: 1500,
  /** Min rotation speed (zoomed in) */
  MIN_SPEED: 0.1,
  /** Max rotation speed (zoomed out) */
  MAX_SPEED: 0.5,
  /** Default rotation speed */
  DEFAULT_SPEED: 0.3,
} as const;

// =============================================================================
// Point Scattering Configuration
// =============================================================================

export const SCATTER = {
  /** Grid cell size in degrees (~30km) */
  GRID_SIZE: 0.3,
  /** Max scatter distance in degrees (~100km) */
  RADIUS: 1.0,
  /** Golden angle for spiral distribution */
  GOLDEN_ANGLE: 137.5,
} as const;

// =============================================================================
// Point Styling
// =============================================================================

export const POINT_SIZE = {
  /** Base point size */
  BASE: 0.4,
  /** Maximum variation from base */
  VARIATION: 0.5,
  /** Min scale factor when zoomed in */
  MIN_SCALE: 0.1,
  /** Max scale factor when zoomed out */
  MAX_SCALE: 1.0,
} as const;

// =============================================================================
// Data Management
// =============================================================================

export const DATA = {
  /** Maximum points to display on map */
  MAX_POINTS: 5000,
  /** Maximum events in queue */
  MAX_QUEUE_SIZE: 50,
  /** Maximum visible toasts */
  MAX_VISIBLE_TOASTS: 5,
  /** Delay between toast displays (ms) */
  TOAST_DELAY: 500,
  /** Toast display duration (ms) */
  TOAST_DURATION: 2000,
  /** Debounce delay for data updates (ms) */
  UPDATE_DEBOUNCE: 100,
} as const;

// =============================================================================
// Animation & Performance
// =============================================================================

export const PERFORMANCE = {
  /** Position update interval (ms) ~30fps */
  POSITION_UPDATE_INTERVAL: 32,
} as const;

// =============================================================================
// Colors
// =============================================================================

export const COLORS = {
  /** Colors by data source */
  SOURCE: {
    GDELT: '#ff6b6b',      // Red - news
    RSS: '#f39c12',        // Orange - RSS feeds
    Demo: '#4ecdc4',       // Teal - demo
    USGS: '#e74c3c',       // Dark red - earthquakes
    EONET: '#ff9500',      // Amber - natural disasters
    Mastodon: '#6364ff',   // Purple - social
    default: '#ffe66d',    // Yellow
  } as Record<string, string>,
  
  /** Colors by category */
  CATEGORY: {
    news: '#ff6b6b',
    event: '#4ecdc4',
    demo: '#ffe66d',
    earthquake: '#e74c3c',
    wildfires: '#ff9500',
    severeStorms: '#9b59b6',
    volcanoes: '#c0392b',
    floods: '#3498db',
    social: '#6364ff',
    default: '#95e1d3',
  } as Record<string, string>,
  
  /** Globe atmosphere color */
  ATMOSPHERE: '#3a228a',
} as const;

// =============================================================================
// Textures
// =============================================================================

export const TEXTURES = {
  EARTH_DAY: '/textures/earth-day.jpg',
  EARTH_NIGHT: '/textures/earth-night.jpg',
  EARTH_BUMP: '/textures/earth-topology.png',
  BACKGROUND: '//unpkg.com/three-globe/example/img/night-sky.png',
} as const;

// =============================================================================
// Time
// =============================================================================

export const TIME = {
  /** Hour when daytime starts */
  DAY_START: 6,
  /** Hour when daytime ends */
  DAY_END: 18,
} as const;
