/**
 * StatsBar - Feature component
 * Displays aggregate statistics for workers and tasks
 */

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
  return (
    <div className={styles.statsBar}>
      <div className={styles.statsItem}>
        <span className={styles.statsLabel}>Workers:</span>
        <span className={styles.statsValue}>
          <span className={styles.statsActive}>{activeCount}</span>
          {' / '}
          <span className={styles.statsIdle}>{idleCount}</span>
          {' / '}
          <span className={styles.statsError}>{errorCount}</span>
          {' / '}
          {totalWorkers}
        </span>
      </div>
      <div className={styles.statsSeparator}>•</div>
      <div className={styles.statsItem}>
        <span className={styles.statsLabel}>Tasks:</span>
        <span className={styles.statsValue}>
          {activeTasks} active, {completedTasks} completed
        </span>
      </div>
    </div>
  );
}
