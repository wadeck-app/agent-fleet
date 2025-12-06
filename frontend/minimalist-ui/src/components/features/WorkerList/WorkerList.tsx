/**
 * WorkerList - Feature component for displaying workers
 * Composes generic UI components with worker domain logic
 */

import { WorkerInfo } from '@/types/domain';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';
import { Spinner } from '@/components/ui/Spinner/Spinner';
import styles from './WorkerList.module.scss';

export interface WorkerListProps {
  workers: WorkerInfo[];
  loading?: boolean;
  error?: string | null;
  getWorkerTypeLabel: (type: WorkerInfo['type']) => string;
  getWorkerTypeColor: (type: WorkerInfo['type']) => string;
  getWorkerStatusLabel: (worker: WorkerInfo) => string;
}

export function WorkerList({
  workers,
  loading = false,
  error = null,
  getWorkerTypeLabel,
  getWorkerTypeColor,
  getWorkerStatusLabel,
}: WorkerListProps) {
  if (loading) {
    return (
      <div className={styles.centerContainer}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centerContainer}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className={styles.centerContainer}>
        <p className={styles.emptyText}>No workers connected</p>
      </div>
    );
  }

  return (
    <div className={styles.workerList}>
      {workers.map((worker) => {
        const isActive = worker.taskId !== null;
        const statusVariant = isActive ? 'success' : 'default';

        return (
          <Card key={worker.id} className={styles.workerCard} interactive>
            <div className={styles.workerHeader}>
              <div className={styles.workerInfo}>
                <h3 className={styles.workerType}>{getWorkerTypeLabel(worker.type)}</h3>
                <p className={styles.workerId}>{worker.id}</p>
              </div>
              <Badge variant={statusVariant} dot>
                {getWorkerStatusLabel(worker)}
              </Badge>
            </div>

            {isActive && worker.taskId && (
              <div className={styles.taskInfo}>
                <span className={styles.taskLabel}>Current task:</span>
                <code className={styles.taskId}>{worker.taskId}</code>
              </div>
            )}

            <div className={styles.workerMeta}>
              <span className={styles.metaLabel}>Connected:</span>
              <time className={styles.metaValue}>{new Date(worker.connectedAt).toLocaleString()}</time>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
