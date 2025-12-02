import { memo } from 'react';
import type { GeoDataPoint } from '../types/GeoData';
import './InfoPanel.css';

interface InfoPanelProps {
  point: GeoDataPoint | null;
  isConnected: boolean;
  lastUpdate: Date | null;
  newDataCount: number;
  onClose: () => void;
}

export const InfoPanel = memo(function InfoPanel({
  point,
  isConnected,
  lastUpdate,
  newDataCount,
  onClose,
}: InfoPanelProps) {
  return (
    <div className="info-panel">
      {/* Stats header */}
      <div className="stats-bar">
        <div className="stat stat-status">
          <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span className="stat-label">{isConnected ? 'Live' : 'Offline'}</span>
        </div>
        {newDataCount > 0 && (
          <div className="stat new-data">
            <span className="stat-value">+{newDataCount}</span>
            <span className="stat-label">New</span>
          </div>
        )}
        {lastUpdate && (
          <div className="stat">
            <span className="stat-value">{formatTime(lastUpdate)}</span>
            <span className="stat-label">Updated</span>
          </div>
        )}
      </div>

      {/* Selected point details */}
      {point && (
        <div className="point-details">
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
          
          <h3 className="point-title">{point.title}</h3>
          
          <div className="point-meta">
            <span className="source-badge" data-source={point.source}>
              {point.source}
            </span>
            {point.category && (
              <span className="category-badge">{point.category}</span>
            )}
          </div>
          
          {point.description && (
            <p className="point-description">{point.description}</p>
          )}
          
          <div className="point-location">
            📍 {point.location.latitude.toFixed(4)}, {point.location.longitude.toFixed(4)}
          </div>
          
          <div className="point-time">
            🕐 {new Date(point.timestamp).toLocaleString()}
          </div>
          
          {point.url && (
            <a 
              href={point.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="point-link"
            >
              View Source →
            </a>
          )}
        </div>
      )}

      {/* Instructions when no point selected */}
      {!point && (
        <div className="instructions">
          <p>Click on a point to see details</p>
          <p className="hint">Scroll to zoom • Drag to rotate</p>
        </div>
      )}
    </div>
  );
});

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) {
    return 'Just now';
  }
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
