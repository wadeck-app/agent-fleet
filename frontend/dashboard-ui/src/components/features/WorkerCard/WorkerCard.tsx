import React from 'react';
import { Worker } from '@/types';
import { Badge } from '@/components/ui/Badge/Badge';
import { Card } from '@/components/ui/Card/Card';
import styles from './WorkerCard.module.scss';

interface WorkerCardProps {
  worker: Worker;
  onClick?: (worker: Worker) => void;
  getWorkerTypeLabel: (type: string) => string;
  getWorkerStatusLabel: (status: string) => string;
  getWorkerStatusColor: (status: string) => string;
  formatDuration: (seconds: number) => string;
}

export function WorkerCard({
  worker,
  onClick,
  getWorkerTypeLabel,
  getWorkerStatusLabel,
  getWorkerStatusColor,
  formatDuration,
}: WorkerCardProps) {
  const getStatusVariant = (status: string): 'success' | 'error' | 'default' => {
    if (status === 'active') return 'success';
    if (status === 'error') return 'error';
    return 'default';
  };

  return (
    <Card
      interactive
      className={styles.workerCard}
      onClick={() => onClick?.(worker)}
    >
      <div className={styles.header}>
        <div className={styles.workerInfo}>
          <div
            className={styles.statusIndicator}
            style={{ backgroundColor: getWorkerStatusColor(worker.status) }}
          />
          <div>
            <h3 className={styles.workerId}>{worker.id}</h3>
            <p className={styles.workerType}>{getWorkerTypeLabel(worker.type)}</p>
          </div>
        </div>
        <Badge variant={getStatusVariant(worker.status)}>
          {getWorkerStatusLabel(worker.status)}
        </Badge>
      </div>

      {worker.errorMessage && (
        <div className={styles.errorMessage}>{worker.errorMessage}</div>
      )}

      {worker.currentTask && (
        <div className={styles.currentTask}>
          <div className={styles.taskLabel}>Current Task</div>
          <div className={styles.taskDescription}>{worker.currentTask.description}</div>
          {worker.currentTask.progress !== undefined && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${worker.currentTask.progress}%` }}
              />
              <span className={styles.progressText}>{worker.currentTask.progress}%</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.metricsGrid}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Tasks Completed</div>
          <div className={styles.metricValue}>{worker.metrics.tasksCompleted}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Success Rate</div>
          <div className={styles.metricValue}>{worker.metrics.successRate.toFixed(1)}%</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>Avg Duration</div>
          <div className={styles.metricValue}>{formatDuration(worker.metrics.avgTaskDuration)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>CPU Usage</div>
          <div className={`${styles.metricValue} ${worker.metrics.cpuUsage > 80 ? styles.critical : worker.metrics.cpuUsage > 60 ? styles.warning : ''}`}>
            {worker.metrics.cpuUsage.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Connected:</span>
          <span className={styles.footerValue}>
            {new Date(worker.connectedAt).toLocaleTimeString()}
          </span>
        </div>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Last Heartbeat:</span>
          <span className={styles.footerValue}>
            {new Date(worker.lastHeartbeat).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </Card>
  );
}
