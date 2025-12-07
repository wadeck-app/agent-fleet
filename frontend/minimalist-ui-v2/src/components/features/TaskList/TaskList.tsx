/**
 * TaskList - Feature component for displaying tasks
 * Composes generic UI components with task domain logic
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Task, TaskStatus } from '@/types/domain';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';
import { Spinner } from '@/components/ui/Spinner/Spinner';
import { cn } from '@/lib/utils';
import styles from './TaskList.module.scss';

export interface TaskListProps {
  tasks: Task[];
  loading?: boolean;
  error?: string | null;
  onTaskClick?: (task: Task) => void;
  getTaskStatusLabel: (status: TaskStatus) => string;
  getTaskStatusColor: (status: TaskStatus) => string;
}

export function TaskList({
  tasks,
  loading = false,
  error = null,
  onTaskClick,
  getTaskStatusLabel,
  getTaskStatusColor: _getTaskStatusColor,
}: TaskListProps) {
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

  if (tasks.length === 0) {
    return (
      <div className={styles.centerContainer}>
        <p className={styles.emptyText}>No tasks found</p>
      </div>
    );
  }

  return (
    <div className={styles.taskList}>
      <AnimatePresence mode="popLayout">
        {tasks.map((task, index) => {
          const priorityVariant =
            task.priority === 'urgent'
              ? 'error'
              : task.priority === 'high'
                ? 'warning'
                : task.priority === 'medium'
                  ? 'info'
                  : 'default';

          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              layout
            >
              <Card
                className={cn(styles.taskCard, 'p-4')}
                interactive={!!onTaskClick}
                onClick={() => onTaskClick?.(task)}
              >
                <div className={styles.taskHeader}>
                  <div className={styles.taskInfo}>
                    <h3 className={styles.taskDescription}>{task.description}</h3>
                    <div className={styles.taskMeta}>
                      <span className={styles.taskId}>#{task.id.slice(0, 8)}</span>
                      {task.flowId && (
                        <>
                          <span className={styles.separator}>•</span>
                          <span className={styles.flowId}>{task.flowId}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <motion.div
                    className={styles.badges}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 + 0.2 }}
                  >
                    <Badge variant={priorityVariant}>{task.priority}</Badge>
                    <Badge variant="info">{getTaskStatusLabel(task.status)}</Badge>
                  </motion.div>
                </div>

                {task.assignedTo && (
                  <motion.div
                    className={styles.assignee}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 + 0.3 }}
                  >
                    <span className={styles.assigneeLabel}>Assigned to:</span>
                    <span className={styles.assigneeValue}>
                      {task.assignedTo.workerType} - {task.assignedTo.workerId.slice(0, 8)}
                    </span>
                  </motion.div>
                )}

                <motion.div
                  className={styles.taskFooter}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.05 + 0.35 }}
                >
                  <time className={styles.timestamp}>Updated {formatRelativeTime(task.updatedAt)}</time>
                </motion.div>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return 'just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}
