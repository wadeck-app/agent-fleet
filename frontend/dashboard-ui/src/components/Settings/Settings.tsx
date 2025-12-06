import React, { useState } from 'react';
import { WorkspaceConfig } from '../../types';
import './Settings.css';

interface SettingsProps {
  config: WorkspaceConfig;
  onSave: (config: WorkspaceConfig) => void;
  onClose?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ config, onSave, onClose }) => {
  const [localConfig, setLocalConfig] = useState<WorkspaceConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = <K extends keyof WorkspaceConfig>(
    key: K,
    value: WorkspaceConfig[K]
  ) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(localConfig);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalConfig(config);
    setHasChanges(false);
  };

  const handleThemeToggle = () => {
    const newTheme = localConfig.theme === 'light' ? 'dark' : 'light';
    handleChange('theme', newTheme);

    // Apply theme immediately to DOM
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Settings</h2>
        {onClose && (
          <button className="close-btn" onClick={onClose}>✕</button>
        )}
      </div>

      <div className="settings-content">
        {/* Connection Settings */}
        <section className="settings-section">
          <h3 className="section-title">Connection</h3>

          <div className="setting-item">
            <label htmlFor="orchestratorUrl">Orchestrator URL</label>
            <input
              id="orchestratorUrl"
              type="text"
              className="setting-input"
              value={localConfig.orchestratorUrl}
              onChange={(e) => handleChange('orchestratorUrl', e.target.value)}
              placeholder="ws://localhost:8080"
            />
            <div className="setting-description">
              WebSocket URL of the orchestrator server
            </div>
          </div>

          <div className="setting-item">
            <label htmlFor="heartbeatInterval">Heartbeat Interval (ms)</label>
            <input
              id="heartbeatInterval"
              type="number"
              className="setting-input"
              value={localConfig.heartbeatInterval}
              onChange={(e) => handleChange('heartbeatInterval', parseInt(e.target.value))}
              min="1000"
              max="60000"
              step="1000"
            />
            <div className="setting-description">
              Frequency of heartbeat messages to keep connection alive
            </div>
          </div>

          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={localConfig.autoReconnect}
                onChange={(e) => handleChange('autoReconnect', e.target.checked)}
              />
              <span>Auto-reconnect on connection loss</span>
            </label>
            <div className="setting-description">
              Automatically attempt to reconnect if connection is lost
            </div>
          </div>
        </section>

        {/* Appearance Settings */}
        <section className="settings-section">
          <h3 className="section-title">Appearance</h3>

          <div className="setting-item">
            <label>Theme</label>
            <div className="theme-toggle">
              <button
                className={`theme-btn ${localConfig.theme === 'light' ? 'active' : ''}`}
                onClick={() => {
                  handleChange('theme', 'light');
                  document.documentElement.setAttribute('data-theme', 'light');
                }}
              >
                <span className="theme-icon">☀️</span>
                <span>Light</span>
              </button>
              <button
                className={`theme-btn ${localConfig.theme === 'dark' ? 'active' : ''}`}
                onClick={() => {
                  handleChange('theme', 'dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                }}
              >
                <span className="theme-icon">🌙</span>
                <span>Dark</span>
              </button>
            </div>
          </div>
        </section>

        {/* Notification Settings */}
        <section className="settings-section">
          <h3 className="section-title">Notifications</h3>

          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={localConfig.notificationsEnabled}
                onChange={(e) => handleChange('notificationsEnabled', e.target.checked)}
              />
              <span>Enable notifications</span>
            </label>
            <div className="setting-description">
              Show desktop notifications for important events
            </div>
          </div>
        </section>

        {/* System Information */}
        <section className="settings-section">
          <h3 className="section-title">System Information</h3>

          <div className="info-grid">
            <div className="info-item">
              <div className="info-label">Dashboard Version</div>
              <div className="info-value">v0.1.0</div>
            </div>
            <div className="info-item">
              <div className="info-label">React Version</div>
              <div className="info-value">{React.version}</div>
            </div>
            <div className="info-item">
              <div className="info-label">Build Date</div>
              <div className="info-value">{new Date().toLocaleDateString()}</div>
            </div>
            <div className="info-item">
              <div className="info-label">Environment</div>
              <div className="info-value">
                {import.meta.env.MODE || 'development'}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        {hasChanges && (
          <div className="unsaved-indicator">
            You have unsaved changes
          </div>
        )}
        <div className="settings-actions">
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={!hasChanges}
          >
            Reset
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
