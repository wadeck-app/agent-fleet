import type { TaskStatus, TaskPriority } from '@shared';
import { Card, CardContent } from '@framework/components/primitives/Card';

/**
 * ===========================================================================================
 * TASK FILTERS - Filter Controls
 * ===========================================================================================
 *
 * Provides filtering controls for tasks:
 * - Status dropdown
 * - Priority dropdown
 * - Worker ID input
 *
 * ===========================================================================================
 */

export interface TaskFiltersProps {
	status?: TaskStatus;
	priority?: TaskPriority;
	workerId?: string;
	onStatusChange: (status?: TaskStatus) => void;
	onPriorityChange: (priority?: TaskPriority) => void;
	onWorkerIdChange: (workerId?: string) => void;
	onClearFilters: () => void;
}

const statusOptions: { value: TaskStatus | ''; label: string }[] = [
	{ value: '', label: 'All Statuses' },
	{ value: 'todo', label: 'To Do' },
	{ value: 'in_progress', label: 'In Progress' },
	{ value: 'testing', label: 'Testing' },
	{ value: 'review', label: 'Review' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'merged', label: 'Merged' },
	{ value: 'blocked', label: 'Blocked' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const priorityOptions: { value: TaskPriority | ''; label: string }[] = [
	{ value: '', label: 'All Priorities' },
	{ value: 'urgent', label: 'Urgent' },
	{ value: 'high', label: 'High' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'low', label: 'Low' },
];

export function TaskFilters({
	status,
	priority,
	workerId,
	onStatusChange,
	onPriorityChange,
	onWorkerIdChange,
	onClearFilters,
}: TaskFiltersProps) {
	const hasFilters = status || priority || workerId;

	return (
		<Card>
			<CardContent className="pt-6">
				<div className="flex flex-col gap-4 md:flex-row md:items-end">
					{/* Status Filter */}
					<div className="flex-1">
						<label htmlFor="status-filter" className="mb-2 block text-sm font-medium">
							Status
						</label>
						<select
							id="status-filter"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							value={status || ''}
							onChange={e => onStatusChange(e.target.value as TaskStatus | undefined)}
						>
							{statusOptions.map(option => (
								<option key={option.value || 'all'} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					{/* Priority Filter */}
					<div className="flex-1">
						<label htmlFor="priority-filter" className="mb-2 block text-sm font-medium">
							Priority
						</label>
						<select
							id="priority-filter"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							value={priority || ''}
							onChange={e => onPriorityChange(e.target.value as TaskPriority | undefined)}
						>
							{priorityOptions.map(option => (
								<option key={option.value || 'all'} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					{/* Worker ID Filter */}
					<div className="flex-1">
						<label htmlFor="worker-filter" className="mb-2 block text-sm font-medium">
							Worker ID
						</label>
						<input
							id="worker-filter"
							type="text"
							placeholder="Filter by worker..."
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							value={workerId || ''}
							onChange={e => onWorkerIdChange(e.target.value || undefined)}
						/>
					</div>

					{/* Clear Filters Button */}
					{hasFilters && (
						<div className="flex-shrink-0">
							<button
								type="button"
								onClick={onClearFilters}
								className="h-10 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								Clear Filters
							</button>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
