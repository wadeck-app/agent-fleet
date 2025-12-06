import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import { WorkspaceConfig } from '../../mock/types';
import './ConfigModal.css';

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
      <div className="config-modal-content">
        <div className="config-field">
          <label className="config-label">Orchestrator URL</label>
          <input
            type="text"
            className="config-input"
            value={localConfig.orchestratorUrl}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, orchestratorUrl: e.target.value })
            }
          />
          <span className="config-help">WebSocket connection URL for the orchestrator</span>
        </div>

        <div className="config-field">
          <label className="config-label">Log Level</label>
          <select
            className="config-select"
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
          <span className="config-help">Minimum log level to display</span>
        </div>

        <div className="config-field">
          <label className="config-label">Max Log Entries</label>
          <input
            type="number"
            className="config-input"
            value={localConfig.maxLogEntries}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                maxLogEntries: parseInt(e.target.value) || 1000,
              })
            }
          />
          <span className="config-help">Maximum number of log entries to keep in memory</span>
        </div>

        <div className="config-field">
          <label className="config-checkbox">
            <input
              type="checkbox"
              checked={localConfig.autoReconnect}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, autoReconnect: e.target.checked })
              }
            />
            <span>Auto-reconnect to orchestrator</span>
          </label>
          <span className="config-help">Automatically reconnect if connection is lost</span>
        </div>

        <div className="config-field">
          <label className="config-label">Theme</label>
          <select
            className="config-select"
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
          <span className="config-help">UI color theme (light theme not yet implemented)</span>
        </div>
      </div>
    </Modal>
  );
}
