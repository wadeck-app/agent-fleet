import { useState } from 'react';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { useTasks } from '@/lib/hooks/useTasks';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';
import { CommandPalette, Command } from '@/components/features/CommandPalette/CommandPalette';
import { TaskModal } from '@/components/features/TaskModal/TaskModal';
import { ConfigModal } from '@/components/features/ConfigModal/ConfigModal';
import { WorkspaceConfig } from '@/types/domain';
import styles from './App.module.scss';

const DEFAULT_CONFIG: WorkspaceConfig = {
  orchestratorUrl: 'ws://localhost:8080',
  autoReconnect: true,
  logLevel: 'info',
  maxLogEntries: 1000,
  theme: 'dark',
};

function App() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [config, setConfig] = useState<WorkspaceConfig>(DEFAULT_CONFIG);

  const { createTask } = useTasks();

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    onCommandPalette: () => setIsCommandPaletteOpen((prev) => !prev),
    onNewTask: () => setIsTaskModalOpen(true),
    onSettings: () => setIsConfigModalOpen(true),
  });

  const commands: Command[] = [
    {
      id: 'new-task',
      label: 'Create New Task',
      description: 'Add a new task to the queue',
      shortcut: '⌘N',
      icon: '+',
      category: 'Tasks',
      action: () => setIsTaskModalOpen(true),
    },
    {
      id: 'settings',
      label: 'Open Settings',
      description: 'Configure workspace settings',
      shortcut: '⌘,',
      icon: '⚙',
      category: 'Settings',
      action: () => setIsConfigModalOpen(true),
    },
    {
      id: 'refresh',
      label: 'Refresh Data',
      description: 'Reload workers and tasks',
      icon: '↻',
      category: 'Actions',
      action: () => {
        console.log('Refreshing data...');
      },
    },
    {
      id: 'clear-logs',
      label: 'Clear All Logs',
      description: 'Remove all log entries',
      icon: '✖',
      category: 'Actions',
      action: () => {
        console.log('Clearing logs...');
      },
    },
    {
      id: 'export-logs',
      label: 'Export Logs',
      description: 'Download logs as a file',
      icon: '↓',
      category: 'Actions',
      action: () => {
        console.log('Exporting logs...');
      },
    },
  ];

  const handleTaskSubmit = (name: string, taskConfig: string, type: 'flow' | 'command') => {
    createTask({
      name,
      type,
      config: taskConfig,
    });
    console.log('Task created:', { name, type, config: taskConfig });
  };

  const handleConfigSave = (newConfig: WorkspaceConfig) => {
    setConfig(newConfig);
    console.log('Config saved:', newConfig);
  };

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <div className={styles.appTitle}>
          <span className={styles.appTitleIcon}>⚡</span>
          <h1 className={styles.appTitleText}>Agent Fleet</h1>
        </div>
        <div className={styles.appStatus}>
          <span className={styles.appStatusIndicator} />
          <span className={styles.appStatusText}>Connected to {config.orchestratorUrl}</span>
        </div>
      </header>

      <main className={styles.appMain}>
        <DashboardPage onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
      </main>

      <footer className={styles.appFooter}>
        <button
          className={styles.appFooterButton}
          onClick={() => setIsCommandPaletteOpen(true)}
          title="Open Command Palette (⌘K)"
        >
          <kbd className={styles.appKbd}>⌘K</kbd>
          <span>Command Palette</span>
        </button>
        <button
          className={styles.appFooterButton}
          onClick={() => setIsTaskModalOpen(true)}
          title="Create New Task (⌘N)"
        >
          <kbd className={styles.appKbd}>⌘N</kbd>
          <span>New Task</span>
        </button>
        <button
          className={styles.appFooterButton}
          onClick={() => setIsConfigModalOpen(true)}
          title="Open Settings (⌘,)"
        >
          <kbd className={styles.appKbd}>⌘,</kbd>
          <span>Settings</span>
        </button>
      </footer>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={handleTaskSubmit}
      />

      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={config}
        onSave={handleConfigSave}
      />
    </div>
  );
}

export default App;
