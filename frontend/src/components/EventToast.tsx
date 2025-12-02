import { useEffect, useState } from 'react';
import type { GeoDataPoint } from '../types/GeoData';
import './EventToast.css';

interface Position {
  x: number;
  y: number;
}

interface EventToastProps {
  event: GeoDataPoint;
  position?: Position | null;
  duration?: number;
  onDismiss?: (id: string) => void;
  isHover?: boolean; // If true, no auto-dismiss
}

export function EventToast({ event, position, duration = 2000, onDismiss, isHover = false }: EventToastProps) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Skip auto-dismiss for hover mode
    if (isHover) return;

    // Start fade out after duration - fade animation time
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, duration - 500);

    // Dismiss after full duration
    const dismissTimer = setTimeout(() => {
      onDismiss?.(event.id);
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [event.id, duration, onDismiss, isHover]);

  // Calculate position style - position above the point
  const getPositionStyle = (): React.CSSProperties => {
    if (!position) {
      // Fallback: don't render if no position
      return { display: 'none' };
    }

    // Position the toast above the point
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      transform: 'translate(-50%, -100%) translateY(-20px)',
    };
  };

  if (!position) {
    return null;
  }

  return (
    <div 
      className={`event-toast positioned ${isFading ? 'fading' : ''} ${isHover ? 'hover-toast' : ''}`}
      style={getPositionStyle()}
    >
      <div className="event-toast-pointer" />
      <div className="event-toast-icon">📍</div>
      <div className="event-toast-content">
        <div className="event-toast-title">{event.title}</div>
        <div className="event-toast-meta">
          <span className="event-toast-source" data-source={event.source}>
            {event.source}
          </span>
          <span className="event-toast-location">
            {event.location.latitude.toFixed(2)}°, {event.location.longitude.toFixed(2)}°
          </span>
        </div>
        {event.description && (
          <div className="event-toast-description">
            {event.description.substring(0, 80)}...
          </div>
        )}
      </div>
    </div>
  );
}
