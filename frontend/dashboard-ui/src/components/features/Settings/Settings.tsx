import React, { useState } from 'react';
import { WorkspaceConfig } from '@/types';
import { Button } from '@/components/ui/Button/Button';
import { Card } from '@/components/ui/Card/Card';
import styles from './Settings.module.scss';

interface SettingsProps {
  config: WorkspaceConfig;
  onSave: (config: WorkspaceConfig) => void;
  onClose?: () => void;
}

export function Settings({ config, onSave, onClose }: SettingsProps) {
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

  const handleThemeChange = (theme: 'light' | 'dark') => {
    handleChange('theme', theme);
    // Apply theme immediately to DOM
    document.documentElement.setAttribute('data-theme', theme);
  };

  return (
    <Card className={styles.settings}>
      <div className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        )}
      </div>

      <div className={styles.content}>
        {/* Connection Settings */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Connection</h3>

          <div className={styles.settingItem}>
            <label htmlFor="orchestratorUrl" className={styles.label}>
              Orchestrator URL
            </label>
            <input
              id="orchestratorUrl"
              type="text"
              className={styles.input}
              value={localConfig.orchestratorUrl}
              onChange={(e) => handleChange('orchestratorUrl', e.target.value)}
              placeholder="ws://localhost:8080"
            />
            <div className={styles.settingDescription}>
              WebSocket URL of the orchestrator server
            </div>
          </div>

          <div className={styles.settingItem}>
            <label htmlFor="heartbeatInterval" className={styles.label}>
              Heartbeat Interval (ms)
            </label>
            <input
              id="heartbeatInterval"
              type="number"
              className={styles.input}
              value={localConfig.heartbeatInterval}
              onChange={(e) => handleChange('heartbeatInterval', parseInt(e.target.value))}
              min="1000"
              max="60000"
              step="1000"
            />
            <div className={styles.settingDescription}>
              Frequency of heartbeat messages to keep connection alive
            </div>
          </div>

          <div className={styles.settingItem}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={localConfig.autoReconnect}
                onChange={(e) => handleChange('autoReconnect', e.target.checked)}
              />
              <span>Auto-reconnect on connection loss</span>
            </label>
            <div className={styles.settingDescription}>
              Automatically attempt to reconnect if connection is lost
            </div>
          </div>
        </section>

        {/* Appearance Settings */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Appearance</h3>

          <div className={styles.settingItem}>
            <label className={styles.label}>Theme</label>
            <div className={styles.themeToggle}>
              <button
                type="button"
                className={`${styles.themeBtn} ${localConfig.theme === 'light' ? styles.active : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                <span className={styles.themeIcon}>☀️</span>
                <span>Light</span>
              </button>
              <button
                type="button"
                className={`${styles.themeBtn} ${localConfig.theme === 'dark' ? styles.active : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                <span className={styles.themeIcon}>🌙</span>
                <span>Dark</span>
              </button>
            </div>
          </div>
        </section>

        {/* Notification Settings */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Notifications</h3>

          <div className={styles.settingItem}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={localConfig.notificationsEnabled}
                onChange={(e) => handleChange('notificationsEnabled', e.target.checked)}
              />
              <span>Enable notifications</span>
            </label>
            <div className={styles.settingDescription}>
              Show desktop notifications for important events
            </div>
          </div>
        </section>

        {/* System Information */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>System Information</h3>

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Dashboard Version</div>
              <div className={styles.infoValue}>v0.1.0</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>React Version</div>
              <div className={styles.infoValue}>{React.version}</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Build Date</div>
              <div className={styles.infoValue}>{new Date().toLocaleDateString()}</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Environment</div>
              <div className={styles.infoValue}>
                {import.meta.env.MODE || 'development'}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        {hasChanges && (
          <div className={styles.unsavedIndicator}>
            You have unsaved changes
          </div>
        )}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={!hasChanges}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Card>
  );
}
