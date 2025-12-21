import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';

/**
 * ===========================================================================================
 * THROUGHPUT CARD - Performance Metrics Display
 * ===========================================================================================
 *
 * Displays:
 * - Tasks per hour (with visual indicator)
 * - Success rate (percentage with color coding)
 * - Average task duration (formatted time)
 *
 * Icons:
 * - BarChart3 (tasks/hour)
 * - TrendingUp (success rate)
 * - Clock (avg duration)
 *
 * Color coding for success rate:
 * - >= 90%: green
 * - >= 70%: orange
 * - < 70%: red
 *
 * ===========================================================================================
 */

export interface ThroughputCardProps {
	tasksPerHour: number;
	successRate: number; // 0-100 percentage
	avgTaskDuration: number; // milliseconds
}

/**
 * Format duration in milliseconds to human-readable string
 * Examples: "3m 42s", "45s", "1h 5m"
 */
function formatDuration(milliseconds: number): string {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

/**
 * Get color classes for success rate
 */
function getSuccessRateColor(rate: number): string {
	if (rate >= 90) {
		return 'text-green-600 dark:text-green-400';
	}
	if (rate >= 70) {
		return 'text-orange-600 dark:text-orange-400';
	}
	return 'text-red-600 dark:text-red-400';
}

export function ThroughputCard({ tasksPerHour, successRate, avgTaskDuration }: ThroughputCardProps) {
	const durationFormatted = formatDuration(avgTaskDuration);
	const successRateColor = getSuccessRateColor(successRate);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Throughput</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{/* Tasks per Hour */}
					<div className="flex items-center gap-3">
						<BarChart3 className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Tasks/Hour</span>
							<span className="text-xl font-semibold">{tasksPerHour}</span>
						</div>
					</div>

					{/* Success Rate */}
					<div className="flex items-center gap-3">
						<TrendingUp className={`size-5 ${successRateColor}`} />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Success Rate</span>
							<span className={`text-xl font-semibold ${successRateColor}`}>{successRate}%</span>
						</div>
					</div>

					{/* Average Duration */}
					<div className="flex items-center gap-3">
						<Clock className="size-5 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground">Avg Duration</span>
							<span className="text-base font-medium">{durationFormatted}</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
