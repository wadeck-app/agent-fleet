import React from 'react';
import { Worker } from '../../types';
import './WorkerCard.css';

interface WorkerCardProps {
  worker: Worker;
  onClick?: (worker: Worker) => void;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({ worker, onClick }) => {
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return 'var(--color-active)';
      case 'idle': return 'var(--color-idle)';
      case 'error': return 'var(--color-error-status)';
      case 'disconnected': return 'var(--color-disconnected)';
      default: return 'var(--color-idle)';
    }
  };

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      pm: 'Project Manager',
      po: 'Product Owner',
      dev: 'Developer',
      reviewer: 'Reviewer',
      flow: 'Flow Worker'
    };
    return labels[type] || type.toUpperCase();
  };

  return (
    <div
      className={`worker-card ${worker.status}`}
      onClick={() => onClick?.(worker)}
      role="button"
      tabIndex={0}
    >
      <div className="worker-card-header">
        <div className="worker-info">
          <div
            className="status-indicator"
            style={{ backgroundColor: getStatusColor(worker.status) }}
          />
          <div>
            <h3 className="worker-id">{worker.id}</h3>
            <p className="worker-type">{getTypeLabel(worker.type)}</p>
          </div>
        </div>
        <div className={`status-badge ${worker.status}`}>
          {worker.status}
        </div>
      </div>

      {worker.errorMessage && (
        <div className="error-message">
          {worker.errorMessage}
        </div>
      )}

      {worker.currentTask && (
        <div className="current-task">
          <div className="task-label">Current Task</div>
          <div className="task-description">{worker.currentTask.description}</div>
          {worker.currentTask.progress !== undefined && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${worker.currentTask.progress}%` }}
              />
              <span className="progress-text">{worker.currentTask.progress}%</span>
            </div>
          )}
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric">
          <div className="metric-label">Tasks Completed</div>
          <div className="metric-value">{worker.metrics.tasksCompleted}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Success Rate</div>
          <div className="metric-value">{worker.metrics.successRate.toFixed(1)}%</div>
        </div>
        <div className="metric">
          <div className="metric-label">Avg Duration</div>
          <div className="metric-value">{formatDuration(worker.metrics.avgTaskDuration * 1000)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">CPU Usage</div>
          <div className={`metric-value ${worker.metrics.cpuUsage > 80 ? 'metric-critical' : worker.metrics.cpuUsage > 60 ? 'metric-warning' : ''}`}>
            {worker.metrics.cpuUsage.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="worker-footer">
        <div className="footer-item">
          <span className="footer-label">Connected:</span>
          <span className="footer-value">{new Date(worker.connectedAt).toLocaleTimeString()}</span>
        </div>
        <div className="footer-item">
          <span className="footer-label">Last Heartbeat:</span>
          <span className="footer-value">{new Date(worker.lastHeartbeat).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};
