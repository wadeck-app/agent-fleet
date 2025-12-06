/**
 * TaskList - Feature component for displaying tasks
 * Composes generic UI components with task domain logic
 */

import { Task, TaskStatus } from '@/types/domain';
import { Card } from '@/components/ui/Card/Card';
import { Badge } from '@/components/ui/Badge/Badge';
import { Spinner } from '@/components/ui/Spinner/Spinner';
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
  getTaskStatusColor,
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
      {tasks.map((task) => {
        const priorityVariant =
          task.priority === 'urgent'
            ? 'error'
            : task.priority === 'high'
              ? 'warning'
              : task.priority === 'medium'
                ? 'info'
                : 'default';

        return (
          <Card
            key={task.id}
            className={styles.taskCard}
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
              <div className={styles.badges}>
                <Badge variant={priorityVariant}>{task.priority}</Badge>
                <Badge variant="info">{getTaskStatusLabel(task.status)}</Badge>
              </div>
            </div>

            {task.assignedTo && (
              <div className={styles.assignee}>
                <span className={styles.assigneeLabel}>Assigned to:</span>
                <span className={styles.assigneeValue}>
                  {task.assignedTo.workerType} - {task.assignedTo.workerId.slice(0, 8)}
                </span>
              </div>
            )}

            <div className={styles.taskFooter}>
              <time className={styles.timestamp}>Updated {formatRelativeTime(task.updatedAt)}</time>
            </div>
          </Card>
        );
      })}
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
