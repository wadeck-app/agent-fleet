import type { Worker } from '@shared/api/workers.contract';

interface WorkerMetricsGridProps {
	worker: Worker;
}

/**
 * Displays worker metrics in a grid layout
 */
export function WorkerMetricsGrid({ worker }: WorkerMetricsGridProps) {
	const formatDuration = (ms: number) => {
		const hours = Math.floor(ms / (1000 * 60 * 60));
		const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
		return `${hours}h ${minutes}m`;
	};

	const formatRelative = (isoString: string) => {
		const date = new Date(isoString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMinutes = Math.floor(diffMs / (1000 * 60));

		if (diffMinutes < 1) {
			return 'Just now';
		}
		if (diffMinutes < 60) {
			return `${diffMinutes}m ago`;
		}
		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) {
			return `${diffHours}h ago`;
		}
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	};

	return (
		<div className="grid grid-cols-2 gap-4">
			{/* Tasks Completed */}
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Tasks Completed</h3>
				<p className="text-2xl font-bold text-foreground">{worker.tasksCompleted ?? 'N/A'}</p>
			</div>

			{/* Success Rate */}
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Success Rate</h3>
				<p className="text-2xl font-bold text-foreground">
					{worker.successRate != null ? `${worker.successRate}%` : 'N/A'}
				</p>
			</div>

			{/* Uptime */}
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Uptime</h3>
				<p className="text-2xl font-bold text-foreground">
					{worker.uptime != null ? formatDuration(worker.uptime) : 'N/A'}
				</p>
			</div>

			{/* Last Heartbeat */}
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Last Heartbeat</h3>
				<p className="text-2xl font-bold text-foreground">
					{worker.lastHeartbeat ? formatRelative(worker.lastHeartbeat) : 'N/A'}
				</p>
			</div>
		</div>
	);
}
