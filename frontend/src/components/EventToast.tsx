import { useEffect, useState } from 'react';
import type { GeoDataPoint } from '../types/GeoData';
import './EventToast.css';

interface EventToastProps {
  event: GeoDataPoint | null;
  duration?: number;
  onDismiss: () => void;
}

export function EventToast({ event, duration = 2000, onDismiss }: EventToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (event) {
      // Show the toast
      setIsVisible(true);
      setIsFading(false);

      // Start fade out after duration - fade animation time
      const fadeTimer = setTimeout(() => {
        setIsFading(true);
      }, duration - 500);

      // Dismiss after full duration
      const dismissTimer = setTimeout(() => {
        setIsVisible(false);
        setIsFading(false);
        onDismiss();
      }, duration);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [event, duration, onDismiss]);

  if (!isVisible || !event) {
    return null;
  }

  return (
    <div className={`event-toast ${isFading ? 'fading' : ''}`}>
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

