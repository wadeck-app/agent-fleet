import React, { useState } from 'react';
import { ActivityLogEntry } from '../../types';
import './ActivityLog.css';

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  maxHeight?: string;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ entries, maxHeight = '500px' }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const filteredEntries = entries.filter(entry => {
    const matchesType = filterType === 'all' || entry.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || entry.severity === filterSeverity;
    return matchesType && matchesSeverity;
  });

  const getIcon = (type: string): string => {
    switch (type) {
      case 'task': return '📋';
      case 'worker': return '⚙️';
      case 'system': return '💻';
      case 'error': return '❌';
      default: return '📌';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-error)';
      case 'warning': return 'var(--color-warning)';
      case 'info': return 'var(--color-info)';
      default: return 'var(--color-text-secondary)';
    }
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="activity-log">
      <div className="activity-log-header">
        <h2>Activity Log</h2>
        <div className="activity-count">
          {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>

      <div className="activity-filters">
        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="task">Tasks</option>
          <option value="worker">Workers</option>
          <option value="system">System</option>
          <option value="error">Errors</option>
        </select>

        <select
          className="filter-select"
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
        >
          <option value="all">All Severities</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="activity-timeline" style={{ maxHeight }}>
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            <p>No activity entries found</p>
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <div key={entry.id} className={`activity-entry ${entry.severity}`}>
              <div className="entry-timeline-marker">
                <div
                  className="timeline-dot"
                  style={{ backgroundColor: getSeverityColor(entry.severity) }}
                />
                {index < filteredEntries.length - 1 && (
                  <div className="timeline-line" />
                )}
              </div>

              <div className="entry-content">
                <div className="entry-header">
                  <div className="entry-type">
                    <span className="entry-icon">{getIcon(entry.type)}</span>
                    <span className="entry-type-label">{entry.type}</span>
                  </div>
                  <div className="entry-time">
                    <span className="time-absolute">{formatTime(entry.timestamp)}</span>
                    <span className="time-relative">{formatTimeAgo(entry.timestamp)}</span>
                  </div>
                </div>

                <div className="entry-message">{entry.message}</div>

                {entry.details && Object.keys(entry.details).length > 0 && (
                  <details className="entry-details">
                    <summary>View Details</summary>
                    <pre className="details-content">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
