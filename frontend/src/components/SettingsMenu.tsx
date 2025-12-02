/**
 * Settings menu component with auto-rotate and day/night controls
 */

import { memo } from 'react';
import './SettingsMenu.css';

interface SettingsMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  autoRotate: boolean;
  onAutoRotateChange: (enabled: boolean) => void;
  dayMode: boolean;
  onDayModeChange: (enabled: boolean) => void;
}

export const SettingsMenu = memo(function SettingsMenu({
  isOpen,
  onToggle,
  autoRotate,
  onAutoRotateChange,
  dayMode,
  onDayModeChange,
}: SettingsMenuProps) {
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
        </div>
      )}
    </div>
  );
});
