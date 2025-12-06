/**
 * ConfigModal - Feature component
 * Modal for editing workspace configuration
 */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { WorkspaceConfig } from '@/types/domain';
import styles from './ConfigModal.module.scss';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: WorkspaceConfig;
  onSave: (config: WorkspaceConfig) => void;
}

export function ConfigModal({ isOpen, onClose, config, onSave }: ConfigModalProps) {
  const [localConfig, setLocalConfig] = useState<WorkspaceConfig>(config);

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const handleReset = () => {
    setLocalConfig(config);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Workspace Configuration"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleReset}>
            Reset
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className={styles.configModalContent}>
        <div className={styles.configField}>
          <label className={styles.configLabel}>Orchestrator URL</label>
          <input
            type="text"
            className={styles.configInput}
            value={localConfig.orchestratorUrl}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, orchestratorUrl: e.target.value })
            }
          />
          <span className={styles.configHelp}>WebSocket connection URL for the orchestrator</span>
        </div>

        <div className={styles.configField}>
          <label className={styles.configLabel}>Log Level</label>
          <select
            className={styles.configSelect}
            value={localConfig.logLevel}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                logLevel: e.target.value as WorkspaceConfig['logLevel'],
              })
            }
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <span className={styles.configHelp}>Minimum log level to display</span>
        </div>

        <div className={styles.configField}>
          <label className={styles.configLabel}>Max Log Entries</label>
          <input
            type="number"
            className={styles.configInput}
            value={localConfig.maxLogEntries}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                maxLogEntries: parseInt(e.target.value) || 1000,
              })
            }
          />
          <span className={styles.configHelp}>Maximum number of log entries to keep in memory</span>
        </div>

        <div className={styles.configField}>
          <label className={styles.configCheckbox}>
            <input
              type="checkbox"
              checked={localConfig.autoReconnect}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, autoReconnect: e.target.checked })
              }
            />
            <span>Auto-reconnect to orchestrator</span>
          </label>
          <span className={styles.configHelp}>Automatically reconnect if connection is lost</span>
        </div>

        <div className={styles.configField}>
          <label className={styles.configLabel}>Theme</label>
          <select
            className={styles.configSelect}
            value={localConfig.theme}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                theme: e.target.value as WorkspaceConfig['theme'],
              })
            }
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <span className={styles.configHelp}>UI color theme (light theme not yet implemented)</span>
        </div>
      </div>
    </Modal>
  );
}
