import { SystemMetrics } from '@/types';
import { Card } from '@/components/ui/Card/Card';
import styles from './SystemHealth.module.scss';

interface SystemHealthProps {
  metrics: SystemMetrics;
  getCpuStatusColor: (usage: number) => string;
  getMemoryStatusColor: (percentage: number) => string;
  formatBytes: (bytes: number) => string;
  formatPercentage: (value: number) => string;
}

export function SystemHealth({
  metrics,
  getCpuStatusColor,
  getMemoryStatusColor,
  formatBytes,
  formatPercentage,
}: SystemHealthProps) {
  const cpuColor = getCpuStatusColor(metrics.cpu.usage);
  const memColor = getMemoryStatusColor(metrics.memory.percentage);

  const getOverallStatus = () => {
    if (metrics.cpu.usage < 70 && metrics.memory.percentage < 70) {
      return {
        color: 'var(--color-success)',
        text: 'All systems operational'
      };
    }
    if (metrics.cpu.usage < 90 && metrics.memory.percentage < 90) {
      return {
        color: 'var(--color-warning)',
        text: 'System under moderate load'
      };
    }
    return {
      color: 'var(--color-error)',
      text: 'High system load detected'
    };
  };

  const status = getOverallStatus();

  return (
    <Card className={styles.systemHealth}>
      <div className={styles.header}>
        <h2 className={styles.title}>System Health</h2>
        <div className={styles.lastUpdated}>
          Updated: {new Date(metrics.timestamp).toLocaleTimeString()}
        </div>
      </div>

      <div className={styles.metricsContainer}>
        {/* CPU Metric */}
        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIcon}>💻</div>
            <div className={styles.metricTitle}>CPU Usage</div>
          </div>
          <div className={styles.metricValue} style={{ color: cpuColor }}>
            {formatPercentage(metrics.cpu.usage)}
          </div>
          <div className={styles.metricBar}>
            <div
              className={styles.metricBarFill}
              style={{
                width: `${metrics.cpu.usage}%`,
                backgroundColor: cpuColor
              }}
            />
          </div>
          <div className={styles.metricDetails}>
            {metrics.cpu.cores} cores available
          </div>
        </div>

        {/* Memory Metric */}
        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIcon}>🧠</div>
            <div className={styles.metricTitle}>Memory Usage</div>
          </div>
          <div className={styles.metricValue} style={{ color: memColor }}>
            {formatPercentage(metrics.memory.percentage)}
          </div>
          <div className={styles.metricBar}>
            <div
              className={styles.metricBarFill}
              style={{
                width: `${metrics.memory.percentage}%`,
                backgroundColor: memColor
              }}
            />
          </div>
          <div className={styles.metricDetails}>
            {formatBytes(metrics.memory.used * 1024 * 1024)} / {formatBytes(metrics.memory.total * 1024 * 1024)}
          </div>
        </div>

        {/* Network Metric */}
        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIcon}>🌐</div>
            <div className={styles.metricTitle}>Network Activity</div>
          </div>
          <div className={styles.networkStats}>
            <div className={styles.networkStat}>
              <div className={styles.networkStatLabel}>
                <span className={styles.networkArrow}>↓</span> In
              </div>
              <div className={styles.networkStatValue}>
                {formatBytes(metrics.network.bytesIn)}
              </div>
            </div>
            <div className={styles.networkDivider} />
            <div className={styles.networkStat}>
              <div className={styles.networkStatLabel}>
                <span className={styles.networkArrow}>↑</span> Out
              </div>
              <div className={styles.networkStatValue}>
                {formatBytes(metrics.network.bytesOut)}
              </div>
            </div>
          </div>
        </div>

        {/* Active Connections */}
        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIcon}>🔗</div>
            <div className={styles.metricTitle}>Active Connections</div>
          </div>
          <div className={`${styles.metricValue} ${styles.large}`}>
            {metrics.activeConnections}
          </div>
          <div className={styles.metricDetails}>
            Worker connections established
          </div>
        </div>
      </div>

      {/* System Status Summary */}
      <div className={styles.systemStatus}>
        <div className={styles.statusIndicatorRow}>
          <div
            className={styles.statusLight}
            style={{ backgroundColor: status.color }}
          />
          <div className={styles.statusText}>{status.text}</div>
        </div>
      </div>
    </Card>
  );
}
