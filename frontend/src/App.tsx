/**
 * Main application component
 */

import { useState, useCallback, useEffect } from 'react';
import { Globe } from './components/Globe';
import { InfoPanel } from './components/InfoPanel';
import { SettingsMenu } from './components/SettingsMenu';
import { useGeoData } from './hooks/useGeoData';
import { isDaytime } from './utils/helpers';
import { logger } from './utils/logger';
import type { GeoDataPoint } from './types/GeoData';
import './App.css';

function App() {
  // Data hook
  const {
    data,
    loading,
    error,
    isConnected,
    lastUpdate,
    newDataCount,
    pendingEvents,
    dismissEvent,
  } = useGeoData();

  // UI state
  const [selectedPoint, setSelectedPoint] = useState<GeoDataPoint | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [dayMode, setDayMode] = useState(isDaytime);
  const [menuOpen, setMenuOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------
  useEffect(() => {
    logger.info('Legion app initialized');
    return () => {
      logger.info('Legion app unmounting');
    };
  }, []);

  useEffect(() => {
    if (isConnected) {
      logger.info('Connected to real-time stream');
    }
  }, [isConnected]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handlePointClick = useCallback((point: GeoDataPoint) => {
    logger.debug({ pointId: point.id, title: point.title }, 'Point selected');
    setSelectedPoint(point);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedPoint(null);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handleAutoRotateChange = useCallback((enabled: boolean) => {
    setAutoRotate(enabled);
  }, []);

  const handleDayModeChange = useCallback((enabled: boolean) => {
    setDayMode(enabled);
  }, []);

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <h1>⚠️ Connection Error</h1>
          <p>{error.message}</p>
          <p className="error-hint">
            Make sure the backend is running at <code>http://localhost:3000</code>
          </p>
          <button onClick={() => window.location.reload()}>Retry Connection</button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="app">
      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>Loading globe data...</p>
        </div>
      )}

      {/* Globe */}
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

      {/* Settings */}
      <SettingsMenu
        isOpen={menuOpen}
        onToggle={handleMenuToggle}
        autoRotate={autoRotate}
        onAutoRotateChange={handleAutoRotateChange}
        dayMode={dayMode}
        onDayModeChange={handleDayModeChange}
      />

      {/* Info panel */}
      <InfoPanel
        point={selectedPoint}
        totalCount={data.length}
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        newDataCount={newDataCount}
        onClose={handleCloseDetails}
      />

      {/* Header */}
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
