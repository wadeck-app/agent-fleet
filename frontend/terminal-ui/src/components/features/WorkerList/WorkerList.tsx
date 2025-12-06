/**
 * WorkerList - Feature component
 * Displays list of workers with status and stats
 */

import { Worker } from '@/types/domain';
import styles from './WorkerList.module.scss';

interface WorkerListProps {
  workers: Worker[];
  selectedWorkerId?: string;
  onSelectWorker: (workerId: string) => void;
  getStatusIcon: (status: Worker['status']) => string;
  getWorkerTypeLabel: (type: Worker['type']) => string;
  formatUptime: (seconds: number) => string;
}

export function WorkerList({
  workers,
  selectedWorkerId,
  onSelectWorker,
  getStatusIcon,
  getWorkerTypeLabel,
  formatUptime
}: WorkerListProps) {
  return (
    <div className={styles.workerList}>
      {workers.map((worker) => (
        <button
          key={worker.id}
          className={`${styles.workerItem} ${selectedWorkerId === worker.id ? styles.workerItemSelected : ''}`}
          onClick={() => onSelectWorker(worker.id)}
        >
          <div className={styles.workerItemHeader}>
            <span className={`${styles.workerStatus} ${styles[`workerStatus${worker.status.charAt(0).toUpperCase() + worker.status.slice(1)}`]}`}>
              {getStatusIcon(worker.status)}
            </span>
            <span className={styles.workerName}>{worker.name}</span>
          </div>
          <div className={styles.workerItemDetails}>
            <span className={styles.workerType}>{getWorkerTypeLabel(worker.type)}</span>
            <span className={styles.workerUptime}>{formatUptime(worker.stats.uptime)}</span>
          </div>
          {worker.currentTask && (
            <div className={styles.workerCurrentTask}>{worker.currentTask}</div>
          )}
          <div className={styles.workerStats}>
            <span className={styles.workerStat}>
              <span className={styles.workerStatLabel}>Done:</span> {worker.stats.tasksCompleted}
            </span>
            <span className={styles.workerStat}>
              <span className={styles.workerStatLabel}>Active:</span> {worker.stats.tasksInProgress}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
