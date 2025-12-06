import React from 'react';
import { SystemMetrics } from '../../types';
import './SystemHealth.css';

interface SystemHealthProps {
  metrics: SystemMetrics;
}

export const SystemHealth: React.FC<SystemHealthProps> = ({ metrics }) => {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getMetricColor = (percentage: number): string => {
    if (percentage >= 90) return 'var(--color-metric-critical)';
    if (percentage >= 70) return 'var(--color-metric-warning)';
    return 'var(--color-metric-good)';
  };

  const cpuColor = getMetricColor(metrics.cpu.usage);
  const memColor = getMetricColor(metrics.memory.percentage);

  return (
    <div className="system-health">
      <div className="system-health-header">
        <h2>System Health</h2>
        <div className="last-updated">
          Updated: {new Date(metrics.timestamp).toLocaleTimeString()}
        </div>
      </div>

      <div className="metrics-container">
        {/* CPU Metric */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon">💻</div>
            <div className="metric-title">CPU Usage</div>
          </div>
          <div className="metric-value" style={{ color: cpuColor }}>
            {metrics.cpu.usage.toFixed(1)}%
          </div>
          <div className="metric-bar">
            <div
              className="metric-bar-fill"
              style={{
                width: `${metrics.cpu.usage}%`,
                backgroundColor: cpuColor
              }}
            />
          </div>
          <div className="metric-details">
            {metrics.cpu.cores} cores available
          </div>
        </div>

        {/* Memory Metric */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon">🧠</div>
            <div className="metric-title">Memory Usage</div>
          </div>
          <div className="metric-value" style={{ color: memColor }}>
            {metrics.memory.percentage.toFixed(1)}%
          </div>
          <div className="metric-bar">
            <div
              className="metric-bar-fill"
              style={{
                width: `${metrics.memory.percentage}%`,
                backgroundColor: memColor
              }}
            />
          </div>
          <div className="metric-details">
            {formatBytes(metrics.memory.used * 1024 * 1024)} / {formatBytes(metrics.memory.total * 1024 * 1024)}
          </div>
        </div>

        {/* Network Metric */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon">🌐</div>
            <div className="metric-title">Network Activity</div>
          </div>
          <div className="network-stats">
            <div className="network-stat">
              <div className="network-stat-label">
                <span className="network-arrow">↓</span> In
              </div>
              <div className="network-stat-value">
                {formatBytes(metrics.network.bytesIn)}
              </div>
            </div>
            <div className="network-divider" />
            <div className="network-stat">
              <div className="network-stat-label">
                <span className="network-arrow">↑</span> Out
              </div>
              <div className="network-stat-value">
                {formatBytes(metrics.network.bytesOut)}
              </div>
            </div>
          </div>
        </div>

        {/* Active Connections */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon">🔗</div>
            <div className="metric-title">Active Connections</div>
          </div>
          <div className="metric-value large">
            {metrics.activeConnections}
          </div>
          <div className="metric-details">
            Worker connections established
          </div>
        </div>
      </div>

      {/* System Status Summary */}
      <div className="system-status">
        <div className="status-indicator-row">
          <div className="status-light" style={{
            backgroundColor: metrics.cpu.usage < 70 && metrics.memory.percentage < 70
              ? 'var(--color-success)'
              : metrics.cpu.usage < 90 && metrics.memory.percentage < 90
              ? 'var(--color-warning)'
              : 'var(--color-error)'
          }} />
          <div className="status-text">
            {metrics.cpu.usage < 70 && metrics.memory.percentage < 70
              ? 'All systems operational'
              : metrics.cpu.usage < 90 && metrics.memory.percentage < 90
              ? 'System under moderate load'
              : 'High system load detected'}
          </div>
        </div>
      </div>
    </div>
  );
};
