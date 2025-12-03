/**
 * Settings menu component with auto-rotate, day/night, and source filter controls
 */

import { memo } from 'react';
import type { SourceInfo } from '../services/api';
import './SettingsMenu.css';

// Source icons mapping
const SOURCE_ICONS: Record<string, string> = {
  gdelt: '📰',
  rss: '📡',
  usgs: '🌋',
  eonet: '🔥',
  mastodon: '🦣',
  demo: '🎮',
};

interface SettingsMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  autoRotate: boolean;
  onAutoRotateChange: (enabled: boolean) => void;
  dayMode: boolean;
  onDayModeChange: (enabled: boolean) => void;
  // Source filtering
  availableSources?: SourceInfo[];
  activeSources?: string[];
  onToggleSource?: (sourceName: string) => void;
  isSourceActive?: (sourceName: string) => boolean;
  // Moving objects (satellites, etc.)
  showMovingObjects?: boolean;
  onMovingObjectsChange?: (enabled: boolean) => void;
  movingObjectsCount?: number;
}

export const SettingsMenu = memo(function SettingsMenu({
  isOpen,
  onToggle,
  autoRotate,
  onAutoRotateChange,
  dayMode,
  onDayModeChange,
  availableSources = [],
  activeSources = [],
  onToggleSource,
  isSourceActive,
  showMovingObjects = true,
  onMovingObjectsChange,
  movingObjectsCount = 0,
}: SettingsMenuProps) {
  const getSourceIcon = (name: string) => SOURCE_ICONS[name.toLowerCase()] || '📊';
  
  return (
    <div className={`settings-menu ${isOpen ? 'open' : ''}`}>
      <button
        className="settings-toggle"
        onClick={onToggle}
        title="Settings"
        aria-label="Toggle settings menu"
        aria-expanded={isOpen}
      >
        ⚙️
      </button>

      {isOpen && (
        <div className="settings-panel" role="menu">
          <div className="settings-item">
            <span className="settings-label">Auto-rotate</span>
            <button
              className={`settings-button ${autoRotate ? 'active' : ''}`}
              onClick={() => onAutoRotateChange(!autoRotate)}
              role="menuitemcheckbox"
              aria-checked={autoRotate}
            >
              {autoRotate ? 'On' : 'Off'}
            </button>
          </div>

          <div className="settings-item">
            <span className="settings-label">View</span>
            <button
              className={`settings-button ${dayMode ? 'day' : 'night'}`}
              onClick={() => onDayModeChange(!dayMode)}
              role="menuitemcheckbox"
              aria-checked={dayMode}
            >
              {dayMode ? '☀️ Day' : '🌙 Night'}
            </button>
          </div>

          {/* Moving Objects (Satellites, etc.) */}
          {onMovingObjectsChange && (
            <>
              <div className="settings-divider" />
              <div className="settings-section-title">Tracking</div>
              <div className="settings-item source-item">
                <span className="settings-label source-label">
                  <span className="source-icon">🛰️</span>
                  Satellites
                  {movingObjectsCount > 0 && (
                    <span className="source-count">({movingObjectsCount})</span>
                  )}
                </span>
                <button
                  className={`settings-button source-toggle ${showMovingObjects ? 'active' : ''}`}
                  onClick={() => onMovingObjectsChange(!showMovingObjects)}
                  role="menuitemcheckbox"
                  aria-checked={showMovingObjects}
                >
                  {showMovingObjects ? '✓' : '○'}
                </button>
              </div>
            </>
          )}

          {/* Data Sources */}
          {availableSources.length > 0 && onToggleSource && isSourceActive && (
            <>
              <div className="settings-divider" />
              <div className="settings-section-title">Data Sources</div>
              {availableSources.map((source) => {
                const active = isSourceActive(source.name);
                const canDisable = activeSources.length > 1;
                return (
                  <div key={source.name} className="settings-item source-item">
                    <span className="settings-label source-label">
                      <span className="source-icon">{getSourceIcon(source.name)}</span>
                      {source.name}
                      <span className="source-count">({source.pointCount})</span>
                    </span>
                    <button
                      className={`settings-button source-toggle ${active ? 'active' : ''}`}
                      onClick={() => onToggleSource(source.name)}
                      role="menuitemcheckbox"
                      aria-checked={active}
                      disabled={active && !canDisable}
                      title={active && !canDisable ? 'At least one source must be active' : ''}
                    >
                      {active ? '✓' : '○'}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
});
