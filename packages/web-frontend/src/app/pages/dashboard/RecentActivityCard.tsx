import { StatusIcons, StatusIndicatorIcon } from '@framework/components/feedback/StatusIndicatorIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { ActivityEntry, ActivityType } from '@shared/api/dashboard.contract';

/**
 * ===========================================================================================
 * RECENT ACTIVITY CARD - Activity Feed Display
 * ===========================================================================================
 *
 * Displays:
 * - Recent activity feed (up to 10 entries)
 * - Activity type with appropriate icon
 * - Timestamp (formatted as relative time)
 * - Activity message
 *
 * Activity Icons:
 * - CheckCircle2 (task completed) - green
 * - Activity (task started) - blue
 * - Eye (task review) - purple
 * - GitMerge (task merged) - green
 * - XCircle (task failed) - red
 * - UserCheck (worker connected) - green
 * - UserX (worker disconnected) - red
 *
 * Layout: Vertical feed with timestamp and icon on left, message on right
 *
 * ===========================================================================================
 */

export interface RecentActivityCardProps {
	activities: ActivityEntry[];
}

/**
 * Get icon component for activity type
 */
function getActivityIcon(type: ActivityType) {
	switch (type) {
		case 'task_completed':
			return <StatusIndicatorIcon status="success" icon={StatusIcons.checkCircle} />;
		case 'task_started':
			return <StatusIndicatorIcon status="info" icon={StatusIcons.activity} />;
		case 'task_review':
			return <StatusIndicatorIcon status="purple" icon={StatusIcons.eye} />;
		case 'task_merged':
			return <StatusIndicatorIcon status="success" icon={StatusIcons.gitMerge} />;
		case 'task_failed':
			return <StatusIndicatorIcon status="error" icon={StatusIcons.xCircle} />;
		case 'worker_connected':
			return <StatusIndicatorIcon status="success" icon={StatusIcons.userCheck} />;
		case 'worker_disconnected':
			return <StatusIndicatorIcon status="error" icon={StatusIcons.userX} />;
		default:
			throw new Error(`Unexpected switch value`);
	}
}

/**
 * Format timestamp as relative time (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(timestamp: string): string {
	const now = new Date();
	const activityTime = new Date(timestamp);
	const diffMs = now.getTime() - activityTime.getTime();
	const diffMinutes = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays > 0) {
		return `${diffDays}d ago`;
	}
	if (diffHours > 0) {
		return `${diffHours}h ago`;
	}
	if (diffMinutes > 0) {
		return `${diffMinutes}m ago`;
	}
	return 'just now';
}

/**
 * Format time as HH:MM (e.g., "23:42")
 */
function formatTime(timestamp: string): string {
	const date = new Date(timestamp);
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	return `${hours}:${minutes}`;
}

export function RecentActivityCard({ activities }: RecentActivityCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent Activity</CardTitle>
			</CardHeader>
			<CardContent>
				{activities.length === 0 ? (
					<div className="py-4 text-center text-sm text-muted-foreground">No recent activity</div>
				) : (
					<div className="space-y-3">
						{activities.map((activity, index) => (
							<div
								key={`${activity.timestamp}-${index}`}
								className={`
         flex items-start gap-3
       `}
							>
								{/* Icon */}
								<div className="mt-0.5">{getActivityIcon(activity.type)}</div>

								{/* Content */}
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<div className="flex items-baseline gap-2">
										<span className="text-xs font-medium text-muted-foreground">
											{formatTime(activity.timestamp)}
										</span>
										<span className="text-xs text-muted-foreground">
											{formatRelativeTime(activity.timestamp)}
										</span>
									</div>
									<span className="text-sm">{activity.message}</span>
									{(activity.taskId || activity.workerId) && (
										<div className="flex gap-2 text-xs text-muted-foreground">
											{activity.taskId && <span>Task: {activity.taskId}</span>}
											{activity.workerId && <span>Worker: {activity.workerId}</span>}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
