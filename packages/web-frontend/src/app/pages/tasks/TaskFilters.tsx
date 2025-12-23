import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent } from '@framework/components/primitives/Card';
import type { TaskPriority, TaskStatus } from '@shared';

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
			<CardContent>
				<div
					className={`
       flex flex-col gap-4
       md:flex-row md:items-end
     `}
				>
					{/* Status Filter */}
					<div className="flex-1 space-y-2">
						<Label htmlFor="status-filter">Status</Label>
						<select
							id="status-filter"
							className={`
         h-10 w-full rounded-md border border-input bg-background px-3 py-2
         text-sm ring-offset-background
         focus-visible:ring-2 focus-visible:ring-ring
         focus-visible:ring-offset-2 focus-visible:outline-none
       `}
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
					<div className="flex-1 space-y-2">
						<Label htmlFor="priority-filter">Priority</Label>
						<select
							id="priority-filter"
							className={`
         h-10 w-full rounded-md border border-input bg-background px-3 py-2
         text-sm ring-offset-background
         focus-visible:ring-2 focus-visible:ring-ring
         focus-visible:ring-offset-2 focus-visible:outline-none
       `}
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
					<div className="flex-1 space-y-2">
						<Label htmlFor="worker-filter">Worker ID</Label>
						<Input
							id="worker-filter"
							type="text"
							placeholder="Filter by worker..."
							value={workerId || ''}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								onWorkerIdChange(e.target.value || undefined)
							}
							className="h-10"
						/>
					</div>

					{/* Clear Filters Button */}
					{hasFilters && (
						<div className="flex-shrink-0">
							<Button variant="outline" onClick={onClearFilters} className="h-10">
								Clear Filters
							</Button>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
