// @ts-nocheck - Example code, not compiled
// Integration Test Pattern - Testing component interactions
// Target: 25% of test suite

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TasksPage } from './TasksPage';
import { taskService } from './task-service';

// Mock service layer
vi.mock('./task-service');

describe('TasksPage Integration', () => {
  it('should display tasks and handle status changes', async () => {
    const mockTasks = [
      { id: '1', title: 'Task 1', status: 'todo', displayStatus: 'To Do' },
      { id: '2', title: 'Task 2', status: 'done', displayStatus: 'Done' },
    ];

    vi.mocked(taskService.getTasks).mockResolvedValue(mockTasks);
    vi.mocked(taskService.completeTask).mockResolvedValue({
      ...mockTasks[0],
      status: 'done',
      displayStatus: 'Done',
    });

    // Render full page component
    render(<TasksPage />);

    // Wait for tasks to load
    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    // Find and click complete button
    const completeButton = screen.getByRole('button', { name: /complete/i });
    fireEvent.click(completeButton);

    // Verify service was called
    expect(taskService.completeTask).toHaveBeenCalledWith('1');

    // Verify UI updated
    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  it('should handle context state across multiple components', async () => {
    // When page has >4-5 components using shared state
    const mockTasks = [{ id: '1', title: 'Task 1', status: 'todo' }];
    vi.mocked(taskService.getTasks).mockResolvedValue(mockTasks);

    render(<TasksPage />);

    // Test that filter affects list
    const filterSelect = screen.getByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: 'done' } });

    // Verify list updated based on filter
    await waitFor(() => {
      expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
    });
  });
});
