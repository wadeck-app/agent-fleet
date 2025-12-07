/**
 * DashboardPage - Page component
 * Pure composition - orchestrates feature components with data from hooks
 */

import { useState } from 'react';
import { useWorkers } from '@/lib/hooks/useWorkers';
import { useLogs } from '@/lib/hooks/useLogs';
import { Panel } from '@/components/ui/Panel/Panel';
import { Button } from '@/components/ui/Button/Button';
import { WorkerList } from '@/components/features/WorkerList/WorkerList';
import { Terminal } from '@/components/features/Terminal/Terminal';
import { StatsBar } from '@/components/features/StatsBar/StatsBar';
import styles from './DashboardPage.module.scss';

interface DashboardPageProps {
  onOpenCommandPalette: () => void;
}

export function DashboardPage({ onOpenCommandPalette }: DashboardPageProps) {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | undefined>();
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Use custom hooks for data and formatters
  const {
    workers,
    getWorkerTypeLabel,
    formatUptime,
  } = useWorkers();

  const {
    logs: _logs,
    formatTimestamp,
    getLevelSymbol,
    getTerminalLines,
    clearLogs,
  } = useLogs(selectedWorkerId);

  // Auto-select first worker
  if (!selectedWorkerId && workers.length > 0) {
    setSelectedWorkerId(workers[0].id);
  }

  const selectedWorker = workers.find(w => w.id === selectedWorkerId);

  // Calculate stats for StatsBar
  const activeCount = workers.filter(w => w.status === 'active').length;
  const idleCount = workers.filter(w => w.status === 'idle').length;
  const errorCount = workers.filter(w => w.status === 'error').length;
  const totalTasks = workers.reduce((sum, w) => sum + w.stats.tasksInProgress, 0);
  const completedTasks = workers.reduce((sum, w) => sum + w.stats.tasksCompleted, 0);

  // Get terminal lines
  const terminalLines = getTerminalLines();

  // Helper to get status icon
  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'active': return '●';
      case 'idle': return '◐';
      case 'error': return '✖';
      case 'offline': return '○';
      default: return '•';
    }
  };

  // Helper to highlight search term
  const highlightSearchTerm = (text: string, term: string): JSX.Element => {
    if (!term) return <>{text}</>;
    const parts = text.split(new RegExp(`(${term})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === term.toLowerCase() ? (
            <mark key={i} className={styles.highlight}>{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className={styles.dashboard}>
      <StatsBar
        activeCount={activeCount}
        idleCount={idleCount}
        errorCount={errorCount}
        totalWorkers={workers.length}
        activeTasks={totalTasks}
        completedTasks={completedTasks}
      />

      <div className={styles.dashboardContent}>
        <div className={styles.dashboardSidebar}>
          <Panel
            title="Workers"
            actions={
              <Button size="sm" variant="ghost" onClick={onOpenCommandPalette}>
                ⌘K
              </Button>
            }
          >
            <WorkerList
              workers={workers}
              selectedWorkerId={selectedWorkerId}
              onSelectWorker={setSelectedWorkerId}
              getStatusIcon={getStatusIcon}
              getWorkerTypeLabel={getWorkerTypeLabel}
              formatUptime={formatUptime}
            />
          </Panel>
        </div>

        <div className={styles.dashboardMain}>
          <Panel
            title={selectedWorker ? `${selectedWorker.name} logs` : 'All logs'}
            actions={
              <div className={styles.dashboardActions}>
                <input
                  type="text"
                  className={styles.dashboardSearch}
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <label className={styles.dashboardCheckbox}>
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                  />
                  <span>Auto-scroll</span>
                </label>
                <Button size="sm" variant="ghost" onClick={clearLogs}>
                  Clear
                </Button>
              </div>
            }
          >
            <Terminal
              lines={terminalLines}
              autoScroll={autoScroll}
              searchTerm={searchTerm}
              formatTimestamp={formatTimestamp}
              getLevelSymbol={getLevelSymbol}
              highlightSearchTerm={highlightSearchTerm}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
