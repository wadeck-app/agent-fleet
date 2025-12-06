// @ts-nocheck - Example code, not compiled
// Page Component with Minimal Styling
// Pages should contain virtually zero styling (close to 0 lines of CSS)

import * as React from 'react';
import { MainLayout } from './MainLayout';
import { TaskCard } from './TaskCard';

/**
 * Page component - minimal/zero styling
 * - No inline styles
 * - No className assignments (except for semantic wrapper if needed)
 * - Layout handled by Layout components
 * - Styling handled by child components
 */
export function TasksPage() {
  const { tasks } = useTasks();

  return (
    <MainLayout sidebar={<TaskSidebar />}>
      {/* No styling here - MainLayout handles structure */}
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </MainLayout>
  );
}

// ❌ BAD - Page with styling
function BadTasksPage() {
  return (
    <div style={{ display: 'flex', padding: '20px', gap: '10px' }}>
      {/* Styling in page component - AVOID */}
      <div className={styles.sidebar}>...</div>
      <div className={styles.main}>...</div>
    </div>
  );
}

// ✅ GOOD - Layout component handles styling
function GoodTasksPage() {
  return (
    <MainLayout sidebar={<TaskSidebar />}>
      {/* Zero styling in page */}
      <TaskList />
    </MainLayout>
  );
}
