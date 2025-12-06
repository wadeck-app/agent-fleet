import React, { useState } from 'react';
import { ActivityLogEntry } from '@/types';
import { Card } from '@/components/ui/Card/Card';
import styles from './ActivityLog.module.scss';

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  maxHeight?: string;
  getSeverityColor: (severity: string) => string;
  getSeverityIcon?: (severity: string) => string;
  getTypeLabel: (type: string) => string;
  formatTimestamp: (timestamp: string) => string;
}

export function ActivityLog({
  entries,
  maxHeight = '500px',
  getSeverityColor,
  getSeverityIcon,
  getTypeLabel,
  formatTimestamp,
}: ActivityLogProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const filteredEntries = entries.filter(entry => {
    const matchesType = filterType === 'all' || entry.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || entry.severity === filterSeverity;
    return matchesType && matchesSeverity;
  });

  const defaultGetIcon = (type: string): string => {
    switch (type) {
      case 'task': return '📋';
      case 'worker': return '⚙️';
      case 'system': return '💻';
      case 'error': return '❌';
      default: return '📌';
    }
  };

  const getIcon = getSeverityIcon || defaultGetIcon;

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
    <Card className={styles.activityLog}>
      <div className={styles.header}>
        <h2 className={styles.title}>Activity Log</h2>
        <div className={styles.activityCount}>
          {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>

      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
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
          className={styles.filterSelect}
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

      <div className={styles.timeline} style={{ maxHeight }}>
        {filteredEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No activity entries found</p>
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <div key={entry.id} className={styles.activityEntry}>
              <div className={styles.entryTimelineMarker}>
                <div
                  className={styles.timelineDot}
                  style={{ backgroundColor: getSeverityColor(entry.severity) }}
                />
                {index < filteredEntries.length - 1 && (
                  <div className={styles.timelineLine} />
                )}
              </div>

              <div className={styles.entryContent}>
                <div className={styles.entryHeader}>
                  <div className={styles.entryType}>
                    <span className={styles.entryIcon}>{getIcon(entry.type)}</span>
                    <span className={styles.entryTypeLabel}>{getTypeLabel(entry.type)}</span>
                  </div>
                  <div className={styles.entryTime}>
                    <span className={styles.timeAbsolute}>{formatTimestamp(entry.timestamp)}</span>
                    <span className={styles.timeRelative}>{formatTimeAgo(entry.timestamp)}</span>
                  </div>
                </div>

                <div className={styles.entryMessage}>{entry.message}</div>

                {entry.details && Object.keys(entry.details).length > 0 && (
                  <details className={styles.entryDetails}>
                    <summary className={styles.detailsSummary}>View Details</summary>
                    <pre className={styles.detailsContent}>
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
