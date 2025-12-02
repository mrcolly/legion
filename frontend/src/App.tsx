import { useState, useCallback, useEffect } from 'react';
import { Globe } from './components/Globe';
import { InfoPanel } from './components/InfoPanel';
import { useGeoData } from './hooks/useGeoData';
import type { GeoDataPoint } from './types/GeoData';
import { logger } from './utils/logger';
import './App.css';

function App() {
  const { data, loading, error, isConnected, lastUpdate, newDataCount, latestEvent, clearLatestEvent } = useGeoData();
  const [selectedPoint, setSelectedPoint] = useState<GeoDataPoint | null>(null);

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
          latestEvent={latestEvent}
          onPointClick={handlePointClick}
          onEventDismiss={clearLatestEvent}
        />
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
