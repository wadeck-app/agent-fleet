/**
 * WorkerList - Feature component
 * Displays list of workers with status and stats
 * Enhanced with Framer Motion list animations
 */

import { motion, AnimatePresence } from 'framer-motion';
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
  // Animation variants for list items
  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        delay: i * 0.05,
        duration: 0.3,
        ease: 'easeOut',
      },
    }),
    exit: {
      opacity: 0,
      x: -50,
      scale: 0.9,
      transition: {
        duration: 0.2,
      },
    },
  };

  const statusPulseVariants = {
    idle: {
      scale: [1, 1.2, 1],
      opacity: [0.7, 1, 0.7],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
    active: {
      scale: [1, 1.15, 1],
      opacity: [1, 0.8, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  };

  return (
    <div className={styles.workerList}>
      <AnimatePresence mode="popLayout">
        {workers.map((worker, index) => (
          <motion.button
            key={worker.id}
            custom={index}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            whileHover="hover"
            whileTap="tap"
            className={`${styles.workerItem} ${selectedWorkerId === worker.id ? styles.workerItemSelected : ''}`}
            onClick={() => onSelectWorker(worker.id)}
          >
            <div className={styles.workerItemHeader}>
              <motion.span
                className={`${styles.workerStatus} ${styles[`worker-status-${worker.status}`]}`}
                variants={statusPulseVariants}
                animate={worker.status === 'idle' ? 'idle' : worker.status === 'active' ? 'active' : undefined}
              >
                {getStatusIcon(worker.status)}
              </motion.span>
              <motion.span
                className={styles.workerName}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 + 0.1 }}
              >
                {worker.name}
              </motion.span>
            </div>

            <motion.div
              className={styles.workerItemDetails}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.05 + 0.15 }}
            >
              <span className={styles.workerType}>{getWorkerTypeLabel(worker.type)}</span>
              <span className={styles.workerUptime}>{formatUptime(worker.stats.uptime)}</span>
            </motion.div>

            <AnimatePresence>
              {worker.currentTask && (
                <motion.div
                  className={styles.workerCurrentTask}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    {worker.currentTask}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              className={styles.workerStats}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 + 0.2 }}
            >
              <motion.span
                className={styles.workerStat}
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <span className={styles.workerStatLabel}>Done:</span> {worker.stats.tasksCompleted}
              </motion.span>
              <motion.span
                className={styles.workerStat}
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <span className={styles.workerStatLabel}>Active:</span> {worker.stats.tasksInProgress}
              </motion.span>
            </motion.div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
