import { Worker } from '../../mock/types';
import './WorkerList.css';

interface WorkerListProps {
  workers: Worker[];
  selectedWorkerId?: string;
  onSelectWorker: (workerId: string) => void;
}

export function WorkerList({ workers, selectedWorkerId, onSelectWorker }: WorkerListProps) {
  const getStatusIcon = (status: Worker['status']): string => {
    switch (status) {
      case 'active': return '●';
      case 'idle': return '◐';
      case 'error': return '✖';
      case 'offline': return '○';
      default: return '•';
    }
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="worker-list">
      {workers.map((worker) => (
        <button
          key={worker.id}
          className={`worker-item ${selectedWorkerId === worker.id ? 'worker-item-selected' : ''}`}
          onClick={() => onSelectWorker(worker.id)}
        >
          <div className="worker-item-header">
            <span className={`worker-status worker-status-${worker.status}`}>
              {getStatusIcon(worker.status)}
            </span>
            <span className="worker-name">{worker.name}</span>
          </div>
          <div className="worker-item-details">
            <span className="worker-type">{worker.type}</span>
            <span className="worker-uptime">{formatUptime(worker.stats.uptime)}</span>
          </div>
          {worker.currentTask && (
            <div className="worker-current-task">{worker.currentTask}</div>
          )}
          <div className="worker-stats">
            <span className="worker-stat">
              <span className="worker-stat-label">Done:</span> {worker.stats.tasksCompleted}
            </span>
            <span className="worker-stat">
              <span className="worker-stat-label">Active:</span> {worker.stats.tasksInProgress}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
