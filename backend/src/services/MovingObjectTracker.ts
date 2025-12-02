import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger';

/**
 * Generic Moving Object Tracker
 * Tracks objects that move across the globe (satellites, ISS, planes, ships, etc.)
 * Maintains position history for trajectory visualization
 */

// =============================================================================
// Types
// =============================================================================

export interface Position {
  latitude: number;
  longitude: number;
  altitude?: number; // km above sea level (optional)
  timestamp: Date;
}

export interface MovingObject {
  id: string;
  name: string;
  type: 'satellite' | 'aircraft' | 'ship' | 'vehicle' | 'other';
  icon?: string; // emoji or icon identifier
  color?: string; // hex color for rendering
  velocity?: number; // km/h (optional)
  positions: Position[]; // Last N positions for trajectory
  metadata?: Record<string, unknown>;
}

export interface MovingObjectUpdate {
  object: MovingObject;
  isNew: boolean;
}

// =============================================================================
// Moving Object Tracker Service
// =============================================================================

export class MovingObjectTracker extends EventEmitter {
  private readonly logger = createLogger({ component: 'MovingObjectTracker' });
  private readonly objects: Map<string, MovingObject> = new Map();
  private readonly maxPositions: number;

  constructor(maxPositions = 5) {
    super();
    this.maxPositions = maxPositions;
  }

  /**
   * Update or create a moving object with a new position
   */
  updateObject(
    id: string,
    data: Omit<MovingObject, 'id' | 'positions'> & { position: Omit<Position, 'timestamp'> }
  ): void {
    const existing = this.objects.get(id);
    const isNew = !existing;

    const newPosition: Position = {
      ...data.position,
      timestamp: new Date(),
    };

    let positions: Position[];
    if (existing) {
      // Add new position and keep only the last N
      positions = [...existing.positions, newPosition].slice(-this.maxPositions);
    } else {
      positions = [newPosition];
    }

    const object: MovingObject = {
      id,
      name: data.name,
      type: data.type,
      icon: data.icon,
      color: data.color,
      velocity: data.velocity,
      positions,
      metadata: data.metadata,
    };

    this.objects.set(id, object);

    // Emit update event
    this.emit('object-updated', { object, isNew } as MovingObjectUpdate);

    this.logger.debug({
      id,
      name: data.name,
      lat: newPosition.latitude.toFixed(2),
      lng: newPosition.longitude.toFixed(2),
      positionCount: positions.length,
    }, isNew ? '🆕 New moving object' : '📍 Object position updated');
  }

  /**
   * Remove a moving object
   */
  removeObject(id: string): void {
    if (this.objects.delete(id)) {
      this.emit('object-removed', { id });
      this.logger.debug({ id }, '🗑️ Moving object removed');
    }
  }

  /**
   * Get a specific object
   */
  getObject(id: string): MovingObject | undefined {
    return this.objects.get(id);
  }

  /**
   * Get all moving objects
   */
  getAllObjects(): MovingObject[] {
    return Array.from(this.objects.values());
  }

  /**
   * Get objects by type
   */
  getObjectsByType(type: MovingObject['type']): MovingObject[] {
    return this.getAllObjects().filter(obj => obj.type === type);
  }

  /**
   * Get object count
   */
  getCount(): number {
    return this.objects.size;
  }

  /**
   * Clear all objects
   */
  clear(): void {
    this.objects.clear();
    this.emit('cleared');
    this.logger.info('All moving objects cleared');
  }
}
