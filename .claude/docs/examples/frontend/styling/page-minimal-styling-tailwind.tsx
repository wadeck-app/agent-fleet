// @ts-nocheck - Example code, not compiled
// Page Component with Minimal Styling (Tailwind)
// Pages should contain virtually zero styling (0-5 lines of Tailwind classes max)

import * as React from 'react';
import { MainLayout } from '../components/layout-component';
import { TaskCard } from '../components/feature-component';
import { useTasks } from '../hooks/useTasks';

/**
 * ✅ GOOD - Page component with minimal styling
 * - Uses container + responsive padding (only structural classes)
 * - No styling logic
 * - Layout handled by Layout components
 * - Styling handled by child components
 */
export function GoodTasksPage() {
  const { tasks } = useTasks();

  return (
    <MainLayout
      header={<h1 className="text-2xl font-bold">Tasks</h1>}
      sidebar={<TaskSidebar />}
    >
      {/* Minimal structural wrapper only */}
      <div className="space-y-4">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </MainLayout>
  );
}

/**
 * ❌ BAD - Page with too much styling
 * - Inline styles mixed with Tailwind
 * - Complex styling logic in page
 * - Not delegating to layout components
 */
export function BadTasksPage() {
  const { tasks } = useTasks();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* BAD: Styling in page component */}
      <div className="w-64 bg-gray-100 dark:bg-gray-800 p-4 border-r">
        <TaskSidebar />
      </div>
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
            Tasks
          </h1>
          {/* BAD: Complex grid styling in page */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ✅ GOOD - Alternative with GridLayout
 * - Delegates grid logic to layout component
 * - Page remains purely compositional
 */
export function GoodTasksPageWithGrid() {
  const { tasks } = useTasks();

  return (
    <MainLayout header={<h1 className="text-2xl font-bold">Tasks</h1>}>
      <GridLayout columns={2} gap={6}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </GridLayout>
    </MainLayout>
  );
}

/**
 * ✅ GOOD - Page with state management
 * - Container classes only (structural)
 * - State management in page (appropriate)
 * - Styling delegated to children
 */
export function GoodTasksPageWithState() {
  const { tasks, updateTaskStatus, deleteTask } = useTasks();
  const [filter, setFilter] = React.useState<'all' | 'todo' | 'done'>('all');

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  return (
    <MainLayout
      header={
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <TaskFilter value={filter} onChange={setFilter} />
        </div>
      }
    >
      {/* Only container/spacing classes */}
      <div className="space-y-4">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={updateTaskStatus}
            onDelete={deleteTask}
          />
        ))}
      </div>
    </MainLayout>
  );
}

/**
 * ❌ BAD - Hardcoded colors and inline styles
 * - Breaks theme system
 * - Not using Tailwind utilities
 */
export function BadTasksPageWithHardcodedColors() {
  return (
    <div style={{ backgroundColor: '#ffffff', color: '#000000' }}>
      {/* BAD: Hardcoded hex colors instead of theme */}
      <div className="bg-[#3b82f6] text-[#ffffff] p-4">
        <h1>Tasks</h1>
      </div>
    </div>
  );
}

/**
 * ✅ GOOD - Using theme colors
 * - Uses semantic theme colors
 * - Supports dark mode automatically
 */
export function GoodTasksPageWithThemeColors() {
  return (
    <div className="bg-background text-foreground">
      {/* GOOD: Theme colors via Tailwind */}
      <div className="bg-primary text-primary-foreground p-4">
        <h1>Tasks</h1>
      </div>
    </div>
  );
}
