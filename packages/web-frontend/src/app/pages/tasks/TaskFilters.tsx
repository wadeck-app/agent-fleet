import { Input } from '@framework/components/forms/Input';
import { FilterGrid } from '@framework/components/layout/FilterGrid';
import { Button } from '@framework/components/primitives/Button';
import { SelectInput } from '@framework/features/forms/inputs/SelectInput';
import type { TaskPriority, TaskStatus } from '@shared/api/tasks.contract';

import type { TaskFiltersContract } from './useTaskFilters';

/**
 * ===========================================================================================
 * TASK FILTERS COMPONENT
 * ===========================================================================================
 *
 * UI component for task-specific filters:
 * - Status dropdown
 * - Priority dropdown
 * - Worker ID text input
 * - Flow ID text input
 * - Clear filters button
 *
 * Uses the TaskFiltersContract from useTaskFilters hook.
 *
 * ===========================================================================================
 */

const STATUS_OPTIONS = [
	{ value: '__all__', label: 'All Statuses' },
	{ value: 'backlog', label: 'Backlog' },
	{ value: 'refining', label: 'Refining' },
	{ value: 'refined', label: 'Refined' },
	{ value: 'prioritizing', label: 'Prioritizing' },
	{ value: 'todo', label: 'To Do' },
	{ value: 'in_progress', label: 'In Progress' },
	{ value: 'testing', label: 'Testing' },
	{ value: 'review', label: 'Review' },
	{ value: 'reviewing', label: 'Reviewing' },
	{ value: 'changes_requested', label: 'Changes Requested' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'merged', label: 'Merged' },
	{ value: 'blocked', label: 'Blocked' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
	{ value: '__all__', label: 'All Priorities' },
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

export interface TaskFiltersProps {
	filters: TaskFiltersContract;
}

/**
 * Task filters UI component
 */
export function TaskFilters({ filters }: TaskFiltersProps) {
	return (
		<FilterGrid cols={4}>
			{/* Status Filter */}
			<div>
				<div className="mb-2 text-xs font-medium text-muted-foreground">Status</div>
				<SelectInput
					id="status-filter"
					value={filters.fstate.status || '__all__'}
					onChange={val => filters.actions.setStatus(val === '__all__' ? undefined : (val as TaskStatus))}
					options={STATUS_OPTIONS}
				/>
			</div>

			{/* Priority Filter */}
			<div>
				<div className="mb-2 text-xs font-medium text-muted-foreground">Priority</div>
				<SelectInput
					id="priority-filter"
					value={filters.fstate.priority || '__all__'}
					onChange={val => filters.actions.setPriority(val === '__all__' ? undefined : (val as TaskPriority))}
					options={PRIORITY_OPTIONS}
				/>
			</div>

			{/* Worker ID Filter */}
			<div>
				<div className="mb-2 text-xs font-medium text-muted-foreground">Worker ID</div>
				<Input
					id="worker-filter"
					type="text"
					value={filters.fstate.workerId || ''}
					onChange={e => filters.actions.setWorkerId(e.target.value || undefined)}
					placeholder="Filter by worker..."
				/>
			</div>

			{/* Flow ID Filter */}
			<div>
				<div className="mb-2 text-xs font-medium text-muted-foreground">Flow ID</div>
				<Input
					id="flow-filter"
					type="text"
					value={filters.fstate.flowId || ''}
					onChange={e => filters.actions.setFlowId(e.target.value || undefined)}
					placeholder="Filter by flow..."
				/>
			</div>

			{/* Clear Filters Button - Full width on mobile, auto on larger screens */}
			{filters.fstate.hasFilters && (
				<div
					className={`
       sm:col-span-2
       lg:col-span-4
     `}
				>
					<Button onClick={filters.actions.clearFilters} variant="outline" size="default">
						Clear Filters
					</Button>
				</div>
			)}
		</FilterGrid>
	);
}
