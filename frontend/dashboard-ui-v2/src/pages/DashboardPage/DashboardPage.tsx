import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        <AnimatePresence mode="wait">
          {showSettings ? (
            <motion.div
              key="settings"
              className={styles.fullWidthPanel}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Settings
                config={config}
                onSave={handleConfigSave}
                onClose={() => setShowSettings(false)}
              />
            </motion.div>
          ) : showTaskForm ? (
            <motion.div
              key="taskform"
              className={styles.fullWidthPanel}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <TaskForm
                onSubmit={handleTaskSubmit}
                onCancel={() => setShowTaskForm(false)}
                workflows={mockWorkflows}
              />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* System Health */}
              {metrics && (
                <motion.div
                  className={styles.section}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <SystemHealth
                    metrics={metrics}
                    getCpuStatusColor={getCpuStatusColor}
                    getMemoryStatusColor={getMemoryStatusColor}
                    formatBytes={formatBytes}
                    formatPercentage={formatPercentage}
                  />
                </motion.div>
              )}

              {/* Workers Grid */}
              <motion.div
                className={styles.section}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <h2 className={styles.sectionTitle}>Workers</h2>
                {workersLoading ? (
                  <div className={styles.loading}>Loading workers...</div>
                ) : (
                  <motion.div
                    className={styles.workersGrid}
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.1,
                        },
                      },
                    }}
                  >
                    {workers.map((worker) => (
                      <motion.div
                        key={worker.id}
                        variants={{
                          hidden: { opacity: 0, y: 20 },
                          visible: { opacity: 1, y: 0 },
                        }}
                      >
                        <WorkerCard
                          worker={worker}
                          getWorkerTypeLabel={getWorkerTypeLabel}
                          getWorkerStatusLabel={getWorkerStatusLabel}
                          getWorkerStatusColor={getWorkerStatusColor}
                          formatDuration={formatDuration}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              {/* Tasks and Activity */}
              <motion.div
                className={styles.twoColumn}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
