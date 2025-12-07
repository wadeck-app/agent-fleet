/**
 * DashboardPage - Main application page
 * Purely compositional - brings components together with minimal styling
 */

import { useState } from 'react';
import { useTasks } from '@/lib/hooks/useTasks';
import { useWorkers } from '@/lib/hooks/useWorkers';
import { useFlows } from '@/lib/hooks/useFlows';
import { Button } from '@/components/ui/Button/Button';
import { WorkerList } from '@/components/features/WorkerList/WorkerList';
import { TaskList } from '@/components/features/TaskList/TaskList';
import { NewTaskDialog } from '@/components/features/NewTaskDialog/NewTaskDialog';
import { CreateTaskDTO } from '@/lib/api/repositories/TaskRepository';
import styles from './DashboardPage.module.scss';

export function DashboardPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'workers' | 'tasks'>('workers');

  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    createTask,
    getTaskStatusLabel,
    getTaskStatusColor,
  } = useTasks();

  const {
    workers,
    loading: workersLoading,
    error: workersError,
    getWorkerTypeLabel,
    getWorkerTypeColor,
    getWorkerStatusLabel,
  } = useWorkers();

  const { flows } = useFlows();

  const handleCreateTask = async (data: CreateTaskDTO) => {
    await createTask(data);
  };

  const activeTasks = tasks.filter((t) => ['in_progress', 'testing', 'reviewing'].includes(t.status));
  const pendingTasks = tasks.filter((t) => ['backlog', 'todo', 'changes_requested'].includes(t.status));

  return (
    <div className={styles.dashboard}>
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <h2 className={styles.heroTitle}>Orchestrator Dashboard</h2>
          <p className={styles.heroSubtitle}>Monitor workers and manage tasks</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setDialogOpen(true)}>
          New Task
        </Button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'workers' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('workers')}
        >
          Workers
          <span className={styles.tabCount}>{workers.length}</span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'tasks' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
          <span className={styles.tabCount}>{tasks.length}</span>
        </button>
      </div>

      {activeTab === 'workers' && (
        <section className={styles.section}>
          <WorkerList
            workers={workers}
            loading={workersLoading}
            error={workersError}
            getWorkerTypeLabel={getWorkerTypeLabel}
            getWorkerTypeColor={getWorkerTypeColor}
            getWorkerStatusLabel={getWorkerStatusLabel}
          />
        </section>
      )}

      {activeTab === 'tasks' && (
        <div className={styles.tasksSections}>
          {activeTasks.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Active Tasks</h3>
              <TaskList
                tasks={activeTasks}
                loading={tasksLoading}
                error={tasksError}
                getTaskStatusLabel={getTaskStatusLabel}
                getTaskStatusColor={getTaskStatusColor}
              />
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Pending Tasks</h3>
            <TaskList
              tasks={pendingTasks}
              loading={tasksLoading}
              error={tasksError}
              getTaskStatusLabel={getTaskStatusLabel}
              getTaskStatusColor={getTaskStatusColor}
            />
          </section>
        </div>
      )}

      <NewTaskDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreateTask} flows={flows} />
    </div>
  );
}
