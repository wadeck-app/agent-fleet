import { MetricItem } from '@framework/components/data/MetricItem';
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
					<MetricItem icon={<ListTodo />} label="Total" value={total} valueClassName="text-2xl font-bold" />

					{/* Task Status Grid */}
					<div className="grid grid-cols-2 gap-4">
						{/* Active Tasks */}
						<MetricItem
							icon={<Activity />}
							label="Active"
							value={active}
							iconClassName="size-4 text-info"
							labelClassName="text-xs text-muted-foreground"
							valueClassName="text-base font-semibold text-info"
						/>

						{/* Review Tasks */}
						<MetricItem
							icon={<Eye />}
							label="Review"
							value={review}
							iconClassName="size-4 text-info"
							labelClassName="text-xs text-muted-foreground"
							valueClassName="text-base font-semibold text-info"
						/>

						{/* Done Tasks */}
						<MetricItem
							icon={<CheckCircle2 />}
							label="Done"
							value={done}
							iconClassName="size-4 text-success"
							labelClassName="text-xs text-muted-foreground"
							valueClassName="text-base font-semibold text-success"
						/>

						{/* Blocked Tasks */}
						<MetricItem
							icon={<AlertCircle />}
							label="Blocked"
							value={blocked}
							iconClassName="size-4 text-warning"
							labelClassName="text-xs text-muted-foreground"
							valueClassName="text-base font-semibold text-warning"
						/>

						{/* Failed Tasks */}
						<MetricItem
							icon={<XCircle />}
							label="Failed"
							value={failed}
							iconClassName="size-4 text-danger"
							labelClassName="text-xs text-muted-foreground"
							valueClassName="text-base font-semibold text-danger"
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
