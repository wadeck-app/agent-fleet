import React, { useState } from 'react';
import { useWorkers } from '@/lib/hooks/useWorkers';
import { useTasks } from '@/lib/hooks/useTasks';
import { useSystemHealth } from '@/lib/hooks/useSystemHealth';
import { useActivityLog } from '@/lib/hooks/useActivityLog';
import { useConfig } from '@/lib/hooks/useConfig';
import { WorkerCard } from '@/components/features/WorkerCard/WorkerCard';
import { TaskQueue } from '@/components/features/TaskQueue/TaskQueue';
import { TaskForm } from '@/components/features/TaskForm/TaskForm';
import { SystemHealth } from '@/components/features/SystemHealth/SystemHealth';
import { ActivityLog } from '@/components/features/ActivityLog/ActivityLog';
import { Settings } from '@/components/features/Settings/Settings';
import { Button } from '@/components/ui/Button/Button';
import { mockWorkflows } from '@/data/mockData';
import styles from './DashboardPage.module.scss';

export function DashboardPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);

  const { config, updateConfig } = useConfig();
  const {
    workers,
    loading: workersLoading,
    getWorkerTypeLabel,
    getWorkerStatusLabel,
    getWorkerStatusColor,
    formatDuration,
  } = useWorkers();
  const {
    tasks,
    createTask,
    getTaskStatusLabel,
    getTaskStatusColor,
    getPriorityLabel,
    getPriorityColor,
  } = useTasks();
  const {
    metrics,
    getCpuStatusColor,
    getMemoryStatusColor,
    formatBytes,
    formatPercentage,
  } = useSystemHealth();
  const {
    entries,
    addEntry,
    getSeverityColor,
    getTypeLabel,
    formatTimestamp,
  } = useActivityLog();

  const handleTaskSubmit = async (taskData: any) => {
    const newTask = await createTask(taskData);
    await addEntry({
      type: 'task',
      severity: 'info',
      message: `New task "${taskData.description}" created`,
      details: { taskId: newTask.id, priority: taskData.priority },
    });
    setShowTaskForm(false);

    // Show notification if enabled
    if (config.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Task Created', {
        body: taskData.description,
        icon: '/vite.svg',
      });
    }
  };

  const handleConfigSave = async (newConfig: any) => {
    updateConfig(newConfig);
    await addEntry({
      type: 'system',
      severity: 'success',
      message: 'Configuration updated successfully',
      details: { config: newConfig },
    });
  };

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            <span className={styles.titleIcon}>⚡</span>
            Agent Fleet Dashboard
          </h1>
          <div className={styles.connectionStatus}>
            <div className={styles.statusDot} />
            <span>Connected</span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant={showTaskForm ? 'primary' : 'secondary'}
            onClick={() => {
              setShowTaskForm(!showTaskForm);
              setShowSettings(false);
            }}
          >
            <span>➕</span>
            <span>Add Task</span>
          </Button>
          <Button
            variant={showSettings ? 'primary' : 'secondary'}
            onClick={() => {
              setShowSettings(!showSettings);
              setShowTaskForm(false);
            }}
          >
            <span>⚙️</span>
            <span>Settings</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {showSettings ? (
          <div className={styles.fullWidthPanel}>
            <Settings
              config={config}
              onSave={handleConfigSave}
              onClose={() => setShowSettings(false)}
            />
          </div>
        ) : showTaskForm ? (
          <div className={styles.fullWidthPanel}>
            <TaskForm
              onSubmit={handleTaskSubmit}
              onCancel={() => setShowTaskForm(false)}
              workflows={mockWorkflows}
            />
          </div>
        ) : (
          <>
            {/* System Health */}
            {metrics && (
              <div className={styles.section}>
                <SystemHealth
                  metrics={metrics}
                  getCpuStatusColor={getCpuStatusColor}
                  getMemoryStatusColor={getMemoryStatusColor}
                  formatBytes={formatBytes}
                  formatPercentage={formatPercentage}
                />
              </div>
            )}

            {/* Workers Grid */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Workers</h2>
              {workersLoading ? (
                <div className={styles.loading}>Loading workers...</div>
              ) : (
                <div className={styles.workersGrid}>
                  {workers.map((worker) => (
                    <WorkerCard
                      key={worker.id}
                      worker={worker}
                      getWorkerTypeLabel={getWorkerTypeLabel}
                      getWorkerStatusLabel={getWorkerStatusLabel}
                      getWorkerStatusColor={getWorkerStatusColor}
                      formatDuration={formatDuration}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Tasks and Activity */}
            <div className={styles.twoColumn}>
              <div className={styles.section}>
                <TaskQueue
                  tasks={tasks}
                  getTaskStatusLabel={getTaskStatusLabel}
                  getTaskStatusColor={getTaskStatusColor}
                  getPriorityLabel={getPriorityLabel}
                  getPriorityColor={getPriorityColor}
                />
              </div>
              <div className={styles.section}>
                <ActivityLog
                  entries={entries}
                  getSeverityColor={getSeverityColor}
                  getTypeLabel={getTypeLabel}
                  formatTimestamp={formatTimestamp}
                  maxHeight="600px"
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <span>Agent Fleet v0.1.0</span>
          <span>•</span>
          <span>{workers.length} workers connected</span>
          <span>•</span>
          <span>{tasks.filter((t) => t.status === 'in_progress').length} active tasks</span>
        </div>
      </footer>
    </div>
  );
}
