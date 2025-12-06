import { useState, useEffect } from 'react';
import { Panel } from '../Panel/Panel';
import { WorkerList } from '../WorkerList/WorkerList';
import { Terminal } from '../Terminal/Terminal';
import { StatsBar } from '../StatsBar/StatsBar';
import { Button } from '../Button/Button';
import { Worker, LogEntry } from '../../mock/types';
import { mockDataService } from '../../mock/MockDataService';
import './Dashboard.css';

interface DashboardProps {
  onOpenCommandPalette: () => void;
}

export function Dashboard({ onOpenCommandPalette }: DashboardProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | undefined>();
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Subscribe to workers
    const unsubscribeWorkers = mockDataService.subscribeToWorkers((newWorkers) => {
      setWorkers(newWorkers);
      if (!selectedWorkerId && newWorkers.length > 0) {
        setSelectedWorkerId(newWorkers[0].id);
      }
    });

    // Subscribe to logs
    const unsubscribeLogs = mockDataService.subscribeToLogs((newLog) => {
      setLogs((prev) => [...prev, newLog]);
    });

    // Load initial logs
    setLogs(mockDataService.getLogs());

    return () => {
      unsubscribeWorkers();
      unsubscribeLogs();
    };
  }, [selectedWorkerId]);

  const selectedWorker = workers.find(w => w.id === selectedWorkerId);
  const workerLogs = selectedWorkerId
    ? logs.filter(log => log.workerId === selectedWorkerId)
    : logs;

  const terminalLines = workerLogs.map(log => ({
    id: log.id,
    timestamp: log.timestamp,
    level: log.level,
    content: log.message,
  }));

  const handleClearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="dashboard">
      <StatsBar workers={workers} />
      <div className="dashboard-content">
        <div className="dashboard-sidebar">
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
            />
          </Panel>
        </div>
        <div className="dashboard-main">
          <Panel
            title={selectedWorker ? `${selectedWorker.name} logs` : 'All logs'}
            actions={
              <div className="dashboard-actions">
                <input
                  type="text"
                  className="dashboard-search"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <label className="dashboard-checkbox">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                  />
                  <span>Auto-scroll</span>
                </label>
                <Button size="sm" variant="ghost" onClick={handleClearLogs}>
                  Clear
                </Button>
              </div>
            }
          >
            <Terminal lines={terminalLines} autoScroll={autoScroll} searchTerm={searchTerm} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
