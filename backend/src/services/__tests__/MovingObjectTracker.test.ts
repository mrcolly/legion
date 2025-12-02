import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MovingObjectTracker, MovingObjectUpdate } from '../MovingObjectTracker';

describe('MovingObjectTracker', () => {
  let tracker: MovingObjectTracker;

  beforeEach(() => {
    tracker = new MovingObjectTracker(5); // Keep last 5 positions
  });

  describe('updateObject', () => {
    it('should add a new object with initial position', () => {
      tracker.updateObject('iss', {
        name: 'International Space Station',
        type: 'satellite',
        color: '#00ff88',
        position: { latitude: 45, longitude: -93 },
      });

      const obj = tracker.getObject('iss');
      expect(obj).toBeDefined();
      expect(obj?.name).toBe('International Space Station');
      expect(obj?.type).toBe('satellite');
      expect(obj?.positions).toHaveLength(1);
      expect(obj?.positions[0].latitude).toBe(45);
      expect(obj?.positions[0].longitude).toBe(-93);
    });

    it('should update existing object and append position', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 46, longitude: -92 },
      });

      const obj = tracker.getObject('iss');
      expect(obj?.positions).toHaveLength(2);
      expect(obj?.positions[0].latitude).toBe(45);
      expect(obj?.positions[1].latitude).toBe(46);
    });

    it('should limit position history to maxPositions', () => {
      const smallTracker = new MovingObjectTracker(3);

      for (let i = 0; i < 5; i++) {
        smallTracker.updateObject('iss', {
          name: 'ISS',
          type: 'satellite',
          position: { latitude: i * 10, longitude: i * 10 },
        });
      }

      const obj = smallTracker.getObject('iss');
      expect(obj?.positions).toHaveLength(3);
      // Should keep the last 3 positions (20, 30, 40)
      expect(obj?.positions[0].latitude).toBe(20);
      expect(obj?.positions[1].latitude).toBe(30);
      expect(obj?.positions[2].latitude).toBe(40);
    });

    it('should emit object-updated event for new object', () => {
      const handler = vi.fn();
      tracker.on('object-updated', handler);

      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      expect(handler).toHaveBeenCalledOnce();
      const event: MovingObjectUpdate = handler.mock.calls[0][0];
      expect(event.isNew).toBe(true);
      expect(event.object.id).toBe('iss');
    });

    it('should emit object-updated event for existing object', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      const handler = vi.fn();
      tracker.on('object-updated', handler);

      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 46, longitude: -92 },
      });

      expect(handler).toHaveBeenCalledOnce();
      const event: MovingObjectUpdate = handler.mock.calls[0][0];
      expect(event.isNew).toBe(false);
    });

    it('should include optional fields', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        icon: '🛰️',
        color: '#00ff88',
        velocity: 27600,
        position: { latitude: 45, longitude: -93, altitude: 420 },
        metadata: { orbitalPeriod: 92 },
      });

      const obj = tracker.getObject('iss');
      expect(obj?.icon).toBe('🛰️');
      expect(obj?.color).toBe('#00ff88');
      expect(obj?.velocity).toBe(27600);
      expect(obj?.positions[0].altitude).toBe(420);
      expect(obj?.metadata?.orbitalPeriod).toBe(92);
    });
  });

  describe('removeObject', () => {
    it('should remove an existing object', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      tracker.removeObject('iss');
      expect(tracker.getObject('iss')).toBeUndefined();
    });

    it('should emit object-removed event', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      const handler = vi.fn();
      tracker.on('object-removed', handler);

      tracker.removeObject('iss');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({ id: 'iss' });
    });

    it('should not emit event if object does not exist', () => {
      const handler = vi.fn();
      tracker.on('object-removed', handler);

      tracker.removeObject('nonexistent');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getAllObjects', () => {
    it('should return empty array when no objects', () => {
      expect(tracker.getAllObjects()).toEqual([]);
    });

    it('should return all tracked objects', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      tracker.updateObject('hubble', {
        name: 'Hubble',
        type: 'satellite',
        position: { latitude: 30, longitude: -80 },
      });

      const objects = tracker.getAllObjects();
      expect(objects).toHaveLength(2);
      expect(objects.map(o => o.id)).toContain('iss');
      expect(objects.map(o => o.id)).toContain('hubble');
    });
  });

  describe('getObjectsByType', () => {
    it('should filter objects by type', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      tracker.updateObject('plane1', {
        name: 'Flight 123',
        type: 'aircraft',
        position: { latitude: 40, longitude: -74 },
      });

      tracker.updateObject('hubble', {
        name: 'Hubble',
        type: 'satellite',
        position: { latitude: 30, longitude: -80 },
      });

      const satellites = tracker.getObjectsByType('satellite');
      expect(satellites).toHaveLength(2);

      const aircraft = tracker.getObjectsByType('aircraft');
      expect(aircraft).toHaveLength(1);
      expect(aircraft[0].name).toBe('Flight 123');
    });
  });

  describe('getCount', () => {
    it('should return correct count', () => {
      expect(tracker.getCount()).toBe(0);

      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      expect(tracker.getCount()).toBe(1);

      tracker.updateObject('hubble', {
        name: 'Hubble',
        type: 'satellite',
        position: { latitude: 30, longitude: -80 },
      });

      expect(tracker.getCount()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all objects', () => {
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      tracker.updateObject('hubble', {
        name: 'Hubble',
        type: 'satellite',
        position: { latitude: 30, longitude: -80 },
      });

      tracker.clear();

      expect(tracker.getCount()).toBe(0);
      expect(tracker.getAllObjects()).toEqual([]);
    });

    it('should emit cleared event', () => {
      const handler = vi.fn();
      tracker.on('cleared', handler);

      tracker.clear();

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('position timestamps', () => {
    it('should add timestamp to positions', () => {
      const before = new Date();
      
      tracker.updateObject('iss', {
        name: 'ISS',
        type: 'satellite',
        position: { latitude: 45, longitude: -93 },
      });

      const after = new Date();
      const obj = tracker.getObject('iss');
      const timestamp = obj?.positions[0].timestamp;

      expect(timestamp).toBeDefined();
      expect(timestamp!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
