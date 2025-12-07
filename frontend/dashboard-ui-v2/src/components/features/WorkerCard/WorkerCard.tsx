import { motion } from 'framer-motion';
import { Worker, WorkerType, WorkerStatus } from '@/types';
import { Badge } from '@/components/ui/Badge/Badge';
import { Card } from '@/components/ui/Card/Card';
import styles from './WorkerCard.module.scss';

interface WorkerCardProps {
  worker: Worker;
  onClick?: (worker: Worker) => void;
  getWorkerTypeLabel: (type: WorkerType) => string;
  getWorkerStatusLabel: (status: WorkerStatus) => string;
  getWorkerStatusColor: (status: WorkerStatus) => string;
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
        <motion.div
          className={styles.currentTask}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.taskLabel}>Current Task</div>
          <div className={styles.taskDescription}>{worker.currentTask.description}</div>
          {worker.currentTask.progress !== undefined && (
            <div className={styles.progressBar}>
              <motion.div
                className={styles.progressFill}
                initial={{ width: 0 }}
                animate={{ width: `${worker.currentTask.progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
              <span className={styles.progressText}>{worker.currentTask.progress}%</span>
            </div>
          )}
        </motion.div>
      )}

      <motion.div
        className={styles.metricsGrid}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
            },
          },
        }}
      >
        <motion.div
          className={styles.metric}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <div className={styles.metricLabel}>Tasks Completed</div>
          <div className={styles.metricValue}>{worker.metrics.tasksCompleted}</div>
        </motion.div>
        <motion.div
          className={styles.metric}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <div className={styles.metricLabel}>Success Rate</div>
          <div className={styles.metricValue}>{worker.metrics.successRate.toFixed(1)}%</div>
        </motion.div>
        <motion.div
          className={styles.metric}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <div className={styles.metricLabel}>Avg Duration</div>
          <div className={styles.metricValue}>{formatDuration(worker.metrics.avgTaskDuration)}</div>
        </motion.div>
        <motion.div
          className={styles.metric}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <div className={styles.metricLabel}>CPU Usage</div>
          <div className={`${styles.metricValue} ${worker.metrics.cpuUsage > 80 ? styles.critical : worker.metrics.cpuUsage > 60 ? styles.warning : ''}`}>
            {worker.metrics.cpuUsage.toFixed(1)}%
          </div>
        </motion.div>
      </motion.div>

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
