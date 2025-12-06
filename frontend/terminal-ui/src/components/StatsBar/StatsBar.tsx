import { Worker } from '../../mock/types';
import './StatsBar.css';

interface StatsBarProps {
  workers: Worker[];
}

export function StatsBar({ workers }: StatsBarProps) {
  const activeCount = workers.filter(w => w.status === 'active').length;
  const idleCount = workers.filter(w => w.status === 'idle').length;
  const errorCount = workers.filter(w => w.status === 'error').length;
  const totalTasks = workers.reduce((sum, w) => sum + w.stats.tasksInProgress, 0);
  const completedTasks = workers.reduce((sum, w) => sum + w.stats.tasksCompleted, 0);

  return (
    <div className="stats-bar">
      <div className="stats-item">
        <span className="stats-label">Workers:</span>
        <span className="stats-value">
          <span className="stats-active">{activeCount}</span>
          {' / '}
          <span className="stats-idle">{idleCount}</span>
          {' / '}
          <span className="stats-error">{errorCount}</span>
          {' / '}
          {workers.length}
        </span>
      </div>
      <div className="stats-separator">•</div>
      <div className="stats-item">
        <span className="stats-label">Tasks:</span>
        <span className="stats-value">
          {totalTasks} active, {completedTasks} completed
        </span>
      </div>
    </div>
  );
}
