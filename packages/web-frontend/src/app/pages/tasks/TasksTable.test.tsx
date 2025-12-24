import type { Task } from '@shared/api/tasks.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TasksTable } from './TasksTable';

describe('TasksTable', () => {
	const mockTasks: Task[] = [
		{
			id: 'task-1',
			description: 'Implement authentication system',
			status: 'in_progress',
			priority: 'high',
			createdAt: '2025-12-21T08:00:00Z',
			updatedAt: '2025-12-21T09:30:00Z',
			assignedWorker: {
				workerId: 'worker-1',
			},
		},
		{
			id: 'task-2',
			description: 'Review pull request #123',
			status: 'review',
			priority: 'medium',
			createdAt: '2025-12-21T07:00:00Z',
			updatedAt: '2025-12-21T09:00:00Z',
			assignedWorker: {
				workerId: 'worker-2',
			},
		},
		{
			id: 'task-3',
			description: 'Deploy to production',
			status: 'blocked',
			priority: 'urgent',
			createdAt: '2025-12-21T06:00:00Z',
			updatedAt: '2025-12-21T08:00:00Z',
			assignedWorker: null,
		},
	];

	describe('rendering', () => {
		it('should render table with tasks', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('Tasks List')).toBeInTheDocument();
			expect(screen.getByText('task-1')).toBeInTheDocument();
			expect(screen.getByText('task-2')).toBeInTheDocument();
			expect(screen.getByText('task-3')).toBeInTheDocument();
		});

		it('should display task descriptions', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('Implement authentication system')).toBeInTheDocument();
			expect(screen.getByText('Review pull request #123')).toBeInTheDocument();
			expect(screen.getByText('Deploy to production')).toBeInTheDocument();
		});

		it('should display task statuses', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('In Progress')).toBeInTheDocument();
			expect(screen.getByText('Review')).toBeInTheDocument();
			expect(screen.getByText('Blocked')).toBeInTheDocument();
		});

		it('should display task priorities', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('high')).toBeInTheDocument();
			expect(screen.getByText('medium')).toBeInTheDocument();
			expect(screen.getByText('urgent')).toBeInTheDocument();
		});

		it('should display assigned workers', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('worker-1')).toBeInTheDocument();
			expect(screen.getByText('worker-2')).toBeInTheDocument();
			expect(screen.getByText('dev')).toBeInTheDocument();
			expect(screen.getByText('reviewer')).toBeInTheDocument();
		});

		it('should display unassigned for tasks without workers', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('Unassigned')).toBeInTheDocument();
		});
	});

	describe('empty state', () => {
		it('should show empty message when no tasks', () => {
			render(<TasksTable tasks={[]} />);

			expect(screen.getByText('No tasks available')).toBeInTheDocument();
		});

		it('should not show table when no tasks', () => {
			render(<TasksTable tasks={[]} />);

			expect(screen.queryByText('Task ID')).not.toBeInTheDocument();
		});
	});

	describe('table headers', () => {
		it('should render all column headers', () => {
			render(<TasksTable tasks={mockTasks} />);

			expect(screen.getByText('Task ID')).toBeInTheDocument();
			expect(screen.getByText('Description')).toBeInTheDocument();
			expect(screen.getByText('Status')).toBeInTheDocument();
			expect(screen.getByText('Priority')).toBeInTheDocument();
			expect(screen.getByText('Assigned To')).toBeInTheDocument();
			expect(screen.getByText('Updated')).toBeInTheDocument();
		});
	});

	describe('status badges', () => {
		it('should render different status badges with proper styling', () => {
			const tasksWithVariousStatuses: Task[] = [
				{ ...mockTasks[0], status: 'in_progress' },
				{ ...mockTasks[0], id: 'task-test-1', status: 'review' },
				{ ...mockTasks[0], id: 'task-test-2', status: 'approved' },
				{ ...mockTasks[0], id: 'task-test-3', status: 'merged' },
				{ ...mockTasks[0], id: 'task-test-4', status: 'blocked' },
				{ ...mockTasks[0], id: 'task-test-5', status: 'cancelled' },
			];

			render(<TasksTable tasks={tasksWithVariousStatuses} />);

			expect(screen.getByText('In Progress')).toBeInTheDocument();
			expect(screen.getByText('Review')).toBeInTheDocument();
			expect(screen.getByText('Approved')).toBeInTheDocument();
			expect(screen.getByText('Merged')).toBeInTheDocument();
			expect(screen.getByText('Blocked')).toBeInTheDocument();
			expect(screen.getByText('Failed')).toBeInTheDocument();
		});
	});

	describe('priority badges', () => {
		it('should render different priority badges', () => {
			const tasksWithVariousPriorities: Task[] = [
				{ ...mockTasks[0], priority: 'urgent' },
				{ ...mockTasks[0], id: 'task-test-1', priority: 'high' },
				{ ...mockTasks[0], id: 'task-test-2', priority: 'medium' },
				{ ...mockTasks[0], id: 'task-test-3', priority: 'low' },
			];

			render(<TasksTable tasks={tasksWithVariousPriorities} />);

			expect(screen.getByText('urgent')).toBeInTheDocument();
			expect(screen.getByText('high')).toBeInTheDocument();
			expect(screen.getByText('medium')).toBeInTheDocument();
			expect(screen.getByText('low')).toBeInTheDocument();
		});
	});
});
