import axios from 'axios';
import { MovingObjectTracker } from '../services/MovingObjectTracker';
import { createLogger } from '../utils/logger';

/**
 * ISS (International Space Station) Position Source
 * Fetches real-time ISS position from Open Notify API
 * https://api.open-notify.org/iss-now.json
 */

// =============================================================================
// Types
// =============================================================================

interface OpenNotifyResponse {
  iss_position: {
    latitude: string;
    longitude: string;
  };
  timestamp: number;
  message: string;
}

// =============================================================================
// ISS Source
// =============================================================================

export class ISSSource {
  private readonly logger = createLogger({ component: 'ISSSource' });
  private readonly apiUrl = 'http://api.open-notify.org/iss-now.json';
  private readonly tracker: MovingObjectTracker;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly updateInterval: number;
  private enabled = false;

  // ISS orbital parameters
  private readonly ISS_ALTITUDE = 420; // km
  private readonly ISS_VELOCITY = 27600; // km/h

  constructor(tracker: MovingObjectTracker, updateIntervalMs = 5000) {
    this.tracker = tracker;
    this.updateInterval = updateIntervalMs;
  }

  /**
   * Start tracking ISS position
   */
  start(): void {
    if (this.enabled) {
      this.logger.warn('ISS source already running');
      return;
    }

    this.enabled = true;
    this.logger.info({ interval: this.updateInterval }, '🛰️ ISS source started');

    // Fetch immediately, then on interval
    this.fetchPosition();
    this.intervalId = setInterval(() => {
      this.fetchPosition();
    }, this.updateInterval);
  }

  /**
   * Stop tracking
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.enabled = false;
    this.logger.info('🛰️ ISS source stopped');
  }

  /**
   * Check if running
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Fetch current ISS position
   */
  private async fetchPosition(): Promise<void> {
    try {
      const response = await axios.get<OpenNotifyResponse>(this.apiUrl, {
        timeout: 5000,
      });

      if (response.data.message !== 'success') {
        this.logger.warn({ response: response.data }, 'ISS API returned non-success');
        return;
      }

      // Update the tracker with new position
      this.tracker.updateObject('iss', {
        name: 'International Space Station',
        type: 'satellite',
        icon: '🛰️',
        color: '#00ff88',
        velocity: this.ISS_VELOCITY,
        position: {
          latitude: Number.parseFloat(response.data.iss_position.latitude),
          longitude: Number.parseFloat(response.data.iss_position.longitude),
          altitude: this.ISS_ALTITUDE,
        },
        metadata: {
          source: 'open-notify',
          orbitalPeriod: 92, // minutes
        },
      });

    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({
          error: error.message,
          status: error.response?.status,
        }, 'Error fetching ISS position');
      } else {
        this.logger.error({ error }, 'Error fetching ISS position');
      }
    }
  }
}
