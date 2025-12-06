// @ts-nocheck - Example code, not compiled
// Feature-Specific Component Pattern
// Composes generic components with domain logic

import * as React from 'react';
import { Button } from './Button';
import { useTaskActions } from '../hooks/useTaskActions';
import styles from './TaskCard.module.scss';

interface TaskCardProps {
  taskId: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  onStatusChange?: (taskId: string, status: string) => void;
}

/**
 * Feature-specific TaskCard component
 * - Composes generic Button component
 * - Contains domain logic (task management)
 * - Receives data and callbacks via props
 */
export function TaskCard({
  taskId,
  title,
  status,
  onStatusChange
}: TaskCardProps) {
  const handleComplete = () => {
    onStatusChange?.(taskId, 'done');
  };

  const handleReopen = () => {
    onStatusChange?.(taskId, 'todo');
  };

  return (
    <div className={styles.taskCard}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.status}>{status}</div>
      <div className={styles.actions}>
        {status !== 'done' && (
          <Button variant="primary" onClick={handleComplete}>
            Complete
          </Button>
        )}
        {status === 'done' && (
          <Button variant="secondary" onClick={handleReopen}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}
