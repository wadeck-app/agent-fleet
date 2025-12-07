/**
 * StatsBar - Feature component
 * Displays aggregate statistics for workers and tasks
 * Enhanced with Framer Motion animations
 */

import { motion } from 'framer-motion';
import styles from './StatsBar.module.scss';

interface StatsBarProps {
  activeCount: number;
  idleCount: number;
  errorCount: number;
  totalWorkers: number;
  activeTasks: number;
  completedTasks: number;
}

export function StatsBar({
  activeCount,
  idleCount,
  errorCount,
  totalWorkers,
  activeTasks,
  completedTasks
}: StatsBarProps) {
  // Animation variants for stats
  const statsVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.3,
        ease: 'easeOut',
      },
    }),
  };

  const valueVariants = {
    initial: { scale: 1 },
    pulse: {
      scale: [1, 1.1, 1],
      transition: {
        duration: 0.3,
      },
    },
  };

  return (
    <motion.div
      className={styles.statsBar}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className={styles.statsItem}
        custom={0}
        variants={statsVariants}
        initial="hidden"
        animate="visible"
      >
        <span className={styles.statsLabel}>Workers:</span>
        <motion.span className={styles.statsValue} whileHover="pulse" variants={valueVariants}>
          <motion.span
            className={styles.statsActive}
            key={`active-${activeCount}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            {activeCount}
          </motion.span>
          {' / '}
          <motion.span
            className={styles.statsIdle}
            key={`idle-${idleCount}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            {idleCount}
          </motion.span>
          {' / '}
          <motion.span
            className={styles.statsError}
            key={`error-${errorCount}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            {errorCount}
          </motion.span>
          {' / '}
          {totalWorkers}
        </motion.span>
      </motion.div>

      <motion.div
        className={styles.statsSeparator}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 500 }}
      >
        •
      </motion.div>

      <motion.div
        className={styles.statsItem}
        custom={1}
        variants={statsVariants}
        initial="hidden"
        animate="visible"
      >
        <span className={styles.statsLabel}>Tasks:</span>
        <motion.span className={styles.statsValue} whileHover="pulse" variants={valueVariants}>
          <motion.span
            key={`active-tasks-${activeTasks}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            {activeTasks}
          </motion.span>{' '}
          active,{' '}
          <motion.span
            key={`completed-tasks-${completedTasks}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            {completedTasks}
          </motion.span>{' '}
          completed
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
