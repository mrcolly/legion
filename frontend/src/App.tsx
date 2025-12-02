import { useState, useCallback, useEffect } from 'react';
import { Globe } from './components/Globe';
import { InfoPanel } from './components/InfoPanel';
import { useGeoData } from './hooks/useGeoData';
import type { GeoDataPoint } from './types/GeoData';
import { logger } from './utils/logger';
import './App.css';

// Check if it's daytime based on user's local time (6 AM - 6 PM)
function isDaytime(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

function App() {
  const { data, loading, error, isConnected, lastUpdate, newDataCount, pendingEvents, dismissEvent } = useGeoData();
  const [selectedPoint, setSelectedPoint] = useState<GeoDataPoint | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [dayMode, setDayMode] = useState(isDaytime); // Auto-detect based on local time
  const [menuOpen, setMenuOpen] = useState(false);

  // Log app initialization
  useEffect(() => {
    logger.info('Legion app initialized');
    return () => {
      logger.info('Legion app unmounting');
    };
  }, []);

  // Log connection status changes
  useEffect(() => {
    if (isConnected) {
      logger.info('Connected to real-time stream');
    }
  }, [isConnected]);

  const handlePointClick = useCallback((point: GeoDataPoint) => {
    logger.debug({ pointId: point.id, title: point.title }, 'Point selected');
    setSelectedPoint(point);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedPoint(null);
  }, []);

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <h1>⚠️ Connection Error</h1>
          <p>{error.message}</p>
          <p className="error-hint">
            Make sure the backend is running at{' '}
            <code>http://localhost:3000</code>
          </p>
          <button onClick={() => window.location.reload()}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>Loading globe data...</p>
        </div>
      )}

      {/* Main globe */}
      <div className="globe-container">
        <Globe
          data={data}
          pendingEvents={pendingEvents}
          autoRotate={autoRotate}
          dayMode={dayMode}
          onPointClick={handlePointClick}
          onEventDismiss={dismissEvent}
        />
      </div>

      {/* Settings Menu */}
      <div className={`settings-menu ${menuOpen ? 'open' : ''}`}>
        <button 
          className="settings-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          title="Settings"
        >
          ⚙️
        </button>
        
        {menuOpen && (
          <div className="settings-panel">
            <div className="settings-item">
              <span className="settings-label">Auto-rotate</span>
              <button 
                className={`settings-button ${autoRotate ? 'active' : ''}`}
                onClick={() => setAutoRotate(!autoRotate)}
              >
                {autoRotate ? 'On' : 'Off'}
              </button>
            </div>
            <div className="settings-item">
              <span className="settings-label">View</span>
              <button 
                className={`settings-button ${dayMode ? 'day' : 'night'}`}
                onClick={() => setDayMode(!dayMode)}
              >
                {dayMode ? '☀️ Day' : '🌙 Night'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info panel */}
      <InfoPanel
        point={selectedPoint}
        totalCount={data.length}
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        newDataCount={newDataCount}
        onClose={handleCloseDetails}
      />

      {/* Title */}
      <header className="app-header">
        <h1 className="app-title">
          <span className="title-icon">🌍</span>
          Legion
        </h1>
        <p className="app-subtitle">Real-time Global Events</p>
      </header>
    </div>
  );
}

export default App;
