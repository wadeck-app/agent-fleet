/**
 * WorkerList - Feature component for displaying workers
 * Composes generic UI components with worker domain logic
 */

import { motion, AnimatePresence } from 'framer-motion';
import { WorkerInfo } from '@/types/domain';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';
import { Spinner } from '@/components/ui/Spinner/Spinner';
import { cn } from '@/lib/utils';
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
  getWorkerTypeColor: _getWorkerTypeColor,
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
      <AnimatePresence mode="popLayout">
        {workers.map((worker, index) => {
          const isActive = worker.taskId !== null;
          const statusVariant = isActive ? 'success' : 'default';

          return (
            <motion.div
              key={worker.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.08 }}
              layout
            >
              <Card className={cn(styles.workerCard, 'p-4')} interactive>
                <div className={styles.workerHeader}>
                  <motion.div
                    className={styles.workerInfo}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 + 0.1 }}
                  >
                    <h3 className={styles.workerType}>{getWorkerTypeLabel(worker.type)}</h3>
                    <p className={styles.workerId}>{worker.id}</p>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.08 + 0.2 }}
                  >
                    <Badge variant={statusVariant} dot>
                      {getWorkerStatusLabel(worker)}
                    </Badge>
                  </motion.div>
                </div>

                {isActive && worker.taskId && (
                  <motion.div
                    className={styles.taskInfo}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className={styles.taskLabel}>Current task:</span>
                    <code className={styles.taskId}>{worker.taskId}</code>
                  </motion.div>
                )}

                <motion.div
                  className={styles.workerMeta}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.08 + 0.3 }}
                >
                  <span className={styles.metaLabel}>Connected:</span>
                  <time className={styles.metaValue}>{new Date(worker.connectedAt).toLocaleString()}</time>
                </motion.div>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
