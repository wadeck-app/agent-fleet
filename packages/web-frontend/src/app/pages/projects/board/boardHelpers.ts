import type { TaskStatus } from '@shared/api/tasks.contract';

/**
 * ===========================================================================================
 * BOARD HELPERS
 * ===========================================================================================
 *
 * Helper functions and constants for the project board view.
 * - Task status definitions
 * - Status display labels
 * - Status badge variants
 *
 * ===========================================================================================
 */

/**
 * All task statuses in the order they should appear on the board
 */
export const BOARD_STATUSES: TaskStatus[] = [
	'backlog',
	'refining',
	'refined',
	'prioritizing',
	'todo',
	'in_progress',
	'awaiting_user',
	'testing',
	'review',
	'reviewing',
	'changes_requested',
	'approved',
	'merged',
	'blocked',
	'cancelled',
];

/**
 * Get display label for a task status
 */
export function getStatusLabel(status: TaskStatus): string {
	const labels: Record<TaskStatus, string> = {
		backlog: 'Backlog',
		refining: 'Refining',
		refined: 'Refined',
		prioritizing: 'Prioritizing',
		todo: 'To Do',
		in_progress: 'In Progress',
		awaiting_user: 'Awaiting User',
		testing: 'Testing',
		review: 'Review',
		reviewing: 'Reviewing',
		changes_requested: 'Changes Requested',
		approved: 'Approved',
		merged: 'Merged',
		blocked: 'Blocked',
		cancelled: 'Cancelled',
	};
	return labels[status];
}

/**
 * Get badge variant for a task status
 */
export function getStatusBadgeVariant(
	status: TaskStatus
): 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' {
	const variants: Record<TaskStatus, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive'> = {
		backlog: 'secondary',
		refining: 'info',
		refined: 'info',
		prioritizing: 'warning',
		todo: 'default',
		in_progress: 'info',
		awaiting_user: 'warning',
		testing: 'info',
		review: 'warning',
		reviewing: 'warning',
		changes_requested: 'warning',
		approved: 'success',
		merged: 'success',
		blocked: 'destructive',
		cancelled: 'secondary',
	};
	return variants[status];
}

/**
 * Get badge variant for a task priority
 */
export function getPriorityBadgeVariant(
	priority: 'low' | 'medium' | 'high' | 'urgent'
): 'secondary' | 'default' | 'warning' | 'destructive' {
	const variants: Record<'low' | 'medium' | 'high' | 'urgent', 'secondary' | 'default' | 'warning' | 'destructive'> =
		{
			low: 'secondary',
			medium: 'default',
			high: 'warning',
			urgent: 'destructive',
		};
	return variants[priority];
}

/**
 * Get display label for a task priority
 */
export function getPriorityLabel(priority: 'low' | 'medium' | 'high' | 'urgent'): string {
	const labels: Record<'low' | 'medium' | 'high' | 'urgent', string> = {
		low: 'Low',
		medium: 'Medium',
		high: 'High',
		urgent: 'Urgent',
	};
	return labels[priority];
}
