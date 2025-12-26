import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent } from '@framework/components/primitives/Card';
import { SelectInput } from '@framework/features/forms/inputs/SelectInput';

import type { TaskFiltersContract } from './useTaskFilters2';

/**
 * ===========================================================================================
 * TASK FILTERS2 COMPONENT
 * ===========================================================================================
 *
 * UI component for task-specific filters:
 * - Status dropdown
 * - Priority dropdown
 * - Worker ID text input
 * - Clear filters button
 *
 * Uses the TaskFiltersContract from useTaskFilters2 hook.
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

export interface TaskFilters2Props {
	filters: TaskFiltersContract;
}

/**
 * Task filters UI component
 */
export function TaskFilters2({ filters }: TaskFilters2Props) {
	return (
		<Card className="mb-4">
			<CardContent className="pt-6">
				<div className="flex gap-4 items-end flex-wrap">
					{/* Status Filter */}
					<div className="flex-1 min-w-[200px]">
						<Label htmlFor="status-filter" className="mb-2">
							Status
						</Label>
						<SelectInput
							id="status-filter"
							value={filters.fstate.status || '__all__'}
							onChange={val => filters.actions.setStatus(val === '__all__' ? undefined : (val as any))}
							options={STATUS_OPTIONS}
						/>
					</div>

					{/* Priority Filter */}
					<div className="flex-1 min-w-[200px]">
						<Label htmlFor="priority-filter" className="mb-2">
							Priority
						</Label>
						<SelectInput
							id="priority-filter"
							value={filters.fstate.priority || '__all__'}
							onChange={val => filters.actions.setPriority(val === '__all__' ? undefined : (val as any))}
							options={PRIORITY_OPTIONS}
						/>
					</div>

					{/* Worker ID Filter */}
					<div className="flex-1 min-w-[200px]">
						<Label htmlFor="worker-filter" className="mb-2">
							Worker ID
						</Label>
						<Input
							id="worker-filter"
							type="text"
							value={filters.fstate.workerId || ''}
							onChange={e => filters.actions.setWorkerId(e.target.value || undefined)}
							placeholder="Filter by worker..."
						/>
					</div>

					{/* Clear Filters Button */}
					{filters.fstate.hasFilters && (
						<Button onClick={filters.actions.clearFilters} variant="outline" size="default">
							Clear Filters
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
