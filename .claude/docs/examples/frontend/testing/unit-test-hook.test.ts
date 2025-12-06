// @ts-nocheck - Example code, not compiled
// Unit Test Pattern - Testing hooks in isolation
// Target: 70% of test suite

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTasks } from './useTasks';
import { taskService } from './task-service';

// Mock the service layer
vi.mock('./task-service');

describe('useTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial load', () => {
    it('should load tasks on mount', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'todo' },
        { id: '2', title: 'Task 2', status: 'done' },
      ];

      vi.mocked(taskService.getTasks).mockResolvedValue(mockTasks);

      const { result } = renderHook(() => useTasks());

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.tasks).toEqual(mockTasks);
      expect(result.current.error).toBeNull();
    });

    it('should handle load errors', async () => {
      const error = new Error('Failed to load tasks');
      vi.mocked(taskService.getTasks).mockRejectedValue(error);

      const { result } = renderHook(() => useTasks());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(error);
      expect(result.current.tasks).toEqual([]);
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status locally', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'todo' },
      ];

      vi.mocked(taskService.getTasks).mockResolvedValue(mockTasks);
      vi.mocked(taskService.completeTask).mockResolvedValue({
        id: '1',
        title: 'Task 1',
        status: 'done',
      });

      const { result } = renderHook(() => useTasks());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Update status
      await result.current.updateTaskStatus('1', 'done');

      expect(result.current.tasks[0].status).toBe('done');
    });
  });
});
