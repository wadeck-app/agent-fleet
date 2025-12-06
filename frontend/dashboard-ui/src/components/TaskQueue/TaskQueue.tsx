import React, { useState, useMemo } from 'react';
import { Task, TaskStatus, Priority } from '../../types';
import './TaskQueue.css';

interface TaskQueueProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({ tasks, onTaskClick }) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
      const matchesSearch = task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           task.id.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [tasks, filterStatus, filterPriority, searchQuery]);

  const getPriorityColor = (priority: Priority): string => {
    const colors: Record<Priority, string> = {
      urgent: 'var(--color-priority-urgent)',
      high: 'var(--color-priority-high)',
      medium: 'var(--color-priority-medium)',
      low: 'var(--color-priority-low)'
    };
    return colors[priority];
  };

  const getStatusLabel = (status: TaskStatus): string => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusColor = (status: TaskStatus): string => {
    if ([TaskStatus.IN_PROGRESS, TaskStatus.TESTING, TaskStatus.REVIEWING].includes(status)) {
      return 'var(--color-info)';
    }
    if ([TaskStatus.APPROVED, TaskStatus.MERGED].includes(status)) {
      return 'var(--color-success)';
    }
    if ([TaskStatus.BLOCKED, TaskStatus.CHANGES_REQUESTED, TaskStatus.CANCELLED].includes(status)) {
      return 'var(--color-error)';
    }
    return 'var(--color-text-secondary)';
  };

  const formatTimeAgo = (dateString: string): string => {
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

  return (
    <div className="task-queue">
      <div className="task-queue-header">
        <h2>Task Queue</h2>
        <div className="task-count">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </div>
      </div>

      <div className="task-filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="filter-select"
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
          className="filter-select"
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

      <div className="task-list">
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks found matching your filters</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div
              key={task.id}
              className="task-item"
              onClick={() => onTaskClick?.(task)}
              role="button"
              tabIndex={0}
            >
              <div className="task-item-header">
                <div className="task-item-left">
                  <div
                    className="priority-indicator"
                    style={{ backgroundColor: getPriorityColor(task.priority) }}
                    title={`Priority: ${task.priority}`}
                  />
                  <div className="task-info">
                    <div className="task-id">{task.id}</div>
                    <div className="task-description">{task.description}</div>
                  </div>
                </div>

                <div className="task-item-right">
                  <div
                    className="task-status"
                    style={{ color: getStatusColor(task.status) }}
                  >
                    {getStatusLabel(task.status)}
                  </div>
                </div>
              </div>

              <div className="task-item-footer">
                <div className="task-meta">
                  {task.assignedTo && (
                    <div className="meta-item">
                      <span className="meta-icon">👤</span>
                      <span>{task.assignedTo.workerId}</span>
                    </div>
                  )}
                  {task.flowId && (
                    <div className="meta-item">
                      <span className="meta-icon">⚡</span>
                      <span>{task.flowId}</span>
                    </div>
                  )}
                  <div className="meta-item">
                    <span className="meta-icon">🕒</span>
                    <span>{formatTimeAgo(task.updatedAt)}</span>
                  </div>
                </div>

                {task.progress !== undefined && (
                  <div className="task-progress">
                    <div className="progress-bar-mini">
                      <div
                        className="progress-fill-mini"
                        style={{
                          width: `${task.progress}%`,
                          backgroundColor: getStatusColor(task.status)
                        }}
                      />
                    </div>
                    <span className="progress-percent">{task.progress}%</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
