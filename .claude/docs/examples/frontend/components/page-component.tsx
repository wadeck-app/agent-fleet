// @ts-nocheck - Example code, not compiled
// Page Component Pattern
// Purely compositional - brings components together
// Contains virtually zero styling (close to 0 lines of CSS)

import * as React from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { TaskCard } from './TaskCard';
import { useTasks } from '../hooks/useTasks';

/**
 * Page component - purely compositional
 * - Manages shared state for child components
 * - Zero business logic
 * - Minimal/zero styling
 * - Delegates to layout components for structure
 */
export function TasksPage() {
  // Hook provides data and actions
  const { tasks, updateTaskStatus, isLoading } = useTasks();

  // Shared state lifted to page level
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);

  const handleStatusChange = (taskId: string, status: string) => {
    updateTaskStatus(taskId, status);
  };

  if (isLoading) {
    return <MainLayout>Loading...</MainLayout>;
  }

  return (
    <MainLayout>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          taskId={task.id}
          title={task.title}
          status={task.status}
          onStatusChange={handleStatusChange}
        />
      ))}
    </MainLayout>
  );
}
