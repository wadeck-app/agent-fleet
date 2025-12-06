import React, { useState, useMemo } from 'react';
import { Task, TaskStatus, Priority } from '@/types';
import { Card } from '@/components/ui/Card/Card';
import styles from './TaskQueue.module.scss';

interface TaskQueueProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  getTaskStatusLabel: (status: TaskStatus) => string;
  getTaskStatusColor: (status: TaskStatus) => string;
  getPriorityLabel: (priority: Priority) => string;
  getPriorityColor: (priority: Priority) => string;
  formatTimeAgo?: (dateString: string) => string;
}

export function TaskQueue({
  tasks,
  onTaskClick,
  getTaskStatusLabel,
  getTaskStatusColor,
  getPriorityLabel,
  getPriorityColor,
  formatTimeAgo,
}: TaskQueueProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const defaultFormatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const timeFormatter = formatTimeAgo || defaultFormatTimeAgo;

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
      const matchesSearch = task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           task.id.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [tasks, filterStatus, filterPriority, searchQuery]);

  return (
    <Card className={styles.taskQueue}>
      <div className={styles.header}>
        <h2 className={styles.title}>Task Queue</h2>
        <div className={styles.taskCount}>
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </div>
      </div>

      <div className={styles.filters}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value={TaskStatus.TODO}>To Do</option>
          <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
          <option value={TaskStatus.REVIEW}>Review</option>
          <option value={TaskStatus.BLOCKED}>Blocked</option>
          <option value={TaskStatus.APPROVED}>Approved</option>
        </select>

        <select
          className={styles.filterSelect}
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className={styles.taskList}>
        {filteredTasks.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No tasks found matching your filters</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div
              key={task.id}
              className={styles.taskItem}
              onClick={() => onTaskClick?.(task)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.taskItemHeader}>
                <div className={styles.taskItemLeft}>
                  <div
                    className={styles.priorityIndicator}
                    style={{ backgroundColor: getPriorityColor(task.priority) }}
                    title={`Priority: ${getPriorityLabel(task.priority)}`}
                  />
                  <div className={styles.taskInfo}>
                    <div className={styles.taskId}>{task.id}</div>
                    <div className={styles.taskDescription}>{task.description}</div>
                  </div>
                </div>

                <div className={styles.taskItemRight}>
                  <div
                    className={styles.taskStatus}
                    style={{ color: getTaskStatusColor(task.status) }}
                  >
                    {getTaskStatusLabel(task.status)}
                  </div>
                </div>
              </div>

              <div className={styles.taskItemFooter}>
                <div className={styles.taskMeta}>
                  {task.assignedTo && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaIcon}>👤</span>
                      <span>{task.assignedTo.workerId}</span>
                    </div>
                  )}
                  {task.flowId && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaIcon}>⚡</span>
                      <span>{task.flowId}</span>
                    </div>
                  )}
                  <div className={styles.metaItem}>
                    <span className={styles.metaIcon}>🕒</span>
                    <span>{timeFormatter(task.updatedAt)}</span>
                  </div>
                </div>

                {task.progress !== undefined && (
                  <div className={styles.taskProgress}>
                    <div className={styles.progressBarMini}>
                      <div
                        className={styles.progressFillMini}
                        style={{
                          width: `${task.progress}%`,
                          backgroundColor: getTaskStatusColor(task.status)
                        }}
                      />
                    </div>
                    <span className={styles.progressPercent}>{task.progress}%</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
