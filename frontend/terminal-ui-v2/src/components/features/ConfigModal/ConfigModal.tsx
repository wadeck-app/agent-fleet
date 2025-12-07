/**
 * ConfigModal - Feature component
 * Modal for editing workspace configuration
 * Updated to use shadcn/ui components
 */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Label } from '@/components/ui/Label/Label';
import { Checkbox } from '@/components/ui/Checkbox/Checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select/Select';
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
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleReset}>
            Reset
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      }
    >
      <div className={styles.configModalContent}>
        <div className={styles.configField}>
          <Input
            label="Orchestrator URL"
            type="text"
            value={localConfig.orchestratorUrl}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, orchestratorUrl: e.target.value })
            }
            fullWidth
          />
          <span className={styles.configHelp}>WebSocket connection URL for the orchestrator</span>
        </div>

        <div className={styles.configField}>
          <Label htmlFor="log-level" className="mb-2 block">
            Log Level
          </Label>
          <Select
            value={localConfig.logLevel}
            onValueChange={(value) =>
              setLocalConfig({
                ...localConfig,
                logLevel: value as WorkspaceConfig['logLevel'],
              })
            }
          >
            <SelectTrigger id="log-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <span className={styles.configHelp}>Minimum log level to display</span>
        </div>

        <div className={styles.configField}>
          <Input
            label="Max Log Entries"
            type="number"
            value={localConfig.maxLogEntries}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                maxLogEntries: parseInt(e.target.value) || 1000,
              })
            }
            fullWidth
          />
          <span className={styles.configHelp}>Maximum number of log entries to keep in memory</span>
        </div>

        <div className={styles.configField}>
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-reconnect"
              checked={localConfig.autoReconnect}
              onCheckedChange={(checked) =>
                setLocalConfig({ ...localConfig, autoReconnect: checked === true })
              }
            />
            <Label htmlFor="auto-reconnect" className="cursor-pointer">
              Auto-reconnect to orchestrator
            </Label>
          </div>
          <span className={styles.configHelp}>Automatically reconnect if connection is lost</span>
        </div>

        <div className={styles.configField}>
          <Label htmlFor="theme" className="mb-2 block">
            Theme
          </Label>
          <Select
            value={localConfig.theme}
            onValueChange={(value) =>
              setLocalConfig({
                ...localConfig,
                theme: value as WorkspaceConfig['theme'],
              })
            }
          >
            <SelectTrigger id="theme" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
            </SelectContent>
          </Select>
          <span className={styles.configHelp}>UI color theme (light theme not yet implemented)</span>
        </div>
      </div>
    </Modal>
  );
}
