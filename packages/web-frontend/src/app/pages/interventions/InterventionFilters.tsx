import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Button } from '@framework/components/primitives/Button';
import { SelectInput } from '@framework/features/forms/inputs/SelectInput';

import type { InterventionFiltersContract } from './useInterventionFilters';

/**
 * ===========================================================================================
 * INTERVENTION FILTERS COMPONENT
 * ===========================================================================================
 *
 * UI component for intervention-specific filters:
 * - Status dropdown (pending, answered, timeout, cancelled)
 * - Type dropdown (approval, question, choice)
 * - Blocking dropdown (All, Blocking, Non-Blocking)
 * - Task ID text input
 * - Clear filters button
 *
 * Uses the InterventionFiltersContract from useInterventionFilters hook.
 *
 * ===========================================================================================
 */

const STATUS_OPTIONS = [
	{ value: '__all__', label: 'All Statuses' },
	{ value: 'pending', label: 'Pending' },
	{ value: 'answered', label: 'Answered' },
	{ value: 'timeout', label: 'Timeout' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
	{ value: '__all__', label: 'All Types' },
	{ value: 'approval', label: 'Approval' },
	{ value: 'question', label: 'Question' },
	{ value: 'choice', label: 'Choice' },
];

const BLOCKING_OPTIONS = [
	{ value: '__all__', label: 'All' },
	{ value: 'true', label: 'Blocking' },
	{ value: 'false', label: 'Non-Blocking' },
];

export interface InterventionFiltersProps {
	filters: InterventionFiltersContract;
}

/**
 * Intervention filters UI component
 */
export function InterventionFilters({ filters }: InterventionFiltersProps) {
	return (
		<div
			className={`
     mb-4 grid grid-cols-1 gap-4
     sm:grid-cols-2
     lg:grid-cols-4
   `}
		>
			{/* Status Filter */}
			<div>
				<Label htmlFor="status-filter" className="text-xs">
					Status
				</Label>
				<SelectInput
					id="status-filter"
					value={filters.fstate.status || '__all__'}
					onChange={val => filters.actions.setStatus(val === '__all__' ? undefined : (val as any))}
					options={STATUS_OPTIONS}
				/>
			</div>

			{/* Type Filter */}
			<div>
				<Label htmlFor="type-filter" className="text-xs">
					Type
				</Label>
				<SelectInput
					id="type-filter"
					value={filters.fstate.type || '__all__'}
					onChange={val => filters.actions.setType(val === '__all__' ? undefined : (val as any))}
					options={TYPE_OPTIONS}
				/>
			</div>

			{/* Blocking Filter */}
			<div>
				<Label htmlFor="blocking-filter" className="text-xs">
					Blocking
				</Label>
				<SelectInput
					id="blocking-filter"
					value={filters.fstate.blocking === undefined ? '__all__' : String(filters.fstate.blocking)}
					onChange={val =>
						filters.actions.setBlocking(val === '__all__' ? undefined : val === 'true' ? true : false)
					}
					options={BLOCKING_OPTIONS}
				/>
			</div>

			{/* Task ID Filter */}
			<div>
				<Label htmlFor="task-filter" className="text-xs">
					Task ID
				</Label>
				<Input
					id="task-filter"
					type="text"
					value={filters.fstate.taskId || ''}
					onChange={e => filters.actions.setTaskId(e.target.value || undefined)}
					placeholder="Filter by task..."
				/>
			</div>

			{/* Clear Filters Button - Full width on mobile, auto on larger screens */}
			{filters.fstate.hasFilters && (
				<div className="sm:col-span-2 lg:col-span-4">
					<Button onClick={filters.actions.clearFilters} variant="outline" size="default">
						Clear Filters
					</Button>
				</div>
			)}
		</div>
	);
}
