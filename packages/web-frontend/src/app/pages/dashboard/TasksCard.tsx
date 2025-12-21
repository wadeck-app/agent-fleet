import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { Activity, AlertCircle, CheckCircle2, Eye, ListTodo, XCircle } from 'lucide-react';

/**
 * ===========================================================================================
 * TASKS CARD - Task Metrics Display
 * ===========================================================================================
 *
 * Displays:
 * - Total count (large, text-2xl)
 * - Active/Review/Done/Blocked/Failed counts (smaller, with colors)
 *
 * Icons:
 * - ListTodo (total)
 * - Activity (active)
 * - Eye (review)
 * - CheckCircle2 (done)
 * - AlertCircle (blocked)
 * - XCircle (failed)
 *
 * Layout: 2-column grid for metrics
 * Color coding: blue (active), purple (review), green (done), orange (blocked), red (failed)
 *
 * ===========================================================================================
 */

export interface TasksCardProps {
	total: number;
	active: number;
	review: number;
	done: number;
	blocked: number;
	failed: number;
}

export function TasksCard({ total, active, review, done, blocked, failed }: TasksCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Tasks</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{/* Total Tasks */}
					<div className="flex items-center gap-3">
						<ListTodo className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Total</span>
							<span className="text-2xl font-bold">{total}</span>
						</div>
					</div>

					{/* Task Status Grid */}
					<div className="grid grid-cols-2 gap-4">
						{/* Active Tasks */}
						<div className="flex items-center gap-3">
							<Activity className="size-4 text-blue-600 dark:text-blue-400" />
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">Active</span>
								<span className="text-base font-semibold text-blue-600 dark:text-blue-400">{active}</span>
							</div>
						</div>

						{/* Review Tasks */}
						<div className="flex items-center gap-3">
							<Eye className="size-4 text-purple-600 dark:text-purple-400" />
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">Review</span>
								<span className="text-base font-semibold text-purple-600 dark:text-purple-400">{review}</span>
							</div>
						</div>

						{/* Done Tasks */}
						<div className="flex items-center gap-3">
							<CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">Done</span>
								<span className="text-base font-semibold text-green-600 dark:text-green-400">{done}</span>
							</div>
						</div>

						{/* Blocked Tasks */}
						<div className="flex items-center gap-3">
							<AlertCircle className="size-4 text-orange-600 dark:text-orange-400" />
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">Blocked</span>
								<span className="text-base font-semibold text-orange-600 dark:text-orange-400">{blocked}</span>
							</div>
						</div>

						{/* Failed Tasks */}
						<div className="flex items-center gap-3">
							<XCircle className="size-4 text-red-600 dark:text-red-400" />
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">Failed</span>
								<span className="text-base font-semibold text-red-600 dark:text-red-400">{failed}</span>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
