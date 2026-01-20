import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { Worker } from '@shared/api/workers.contract';
import { B2F_WORKERS_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED } from '@shared/transport';
import { Circle, Cpu, Hourglass, Zap } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { workersApi } from '../../pages/workers/workers.api';

/**
 * Format duration from ISO timestamp to human-readable format
 * @param isoTimestamp ISO 8601 timestamp
 * @returns Formatted duration (e.g., "2m", "1h 5m", "2d 3h")
 */
function formatDuration(isoTimestamp: string): string {
	const start = new Date(isoTimestamp);
	const now = new Date();
	const diffMs = now.getTime() - start.getTime();

	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}
	if (minutes > 0) {
		return `${minutes}m`;
	}
	return `${seconds}s`;
}

/**
 * WorkersWidget - Displays workers with their current tasks in the sidebar
 *
 * Layout:
 * - Busy workers (with tasks) at the top
 * - Idle workers at the bottom
 * - Disconnected workers are hidden
 *
 * Format:
 * worker-001       <Zap/>
 * - Task #abc123 (2m)
 *
 * worker-003 <Hourglass/>
 */
export function WorkersWidget() {
	const [workers, setWorkers] = useState<Worker[]>([]);
	const [loading, setLoading] = useState(true);
	const [, setTick] = useState(0); // Force re-render every second to update durations

	const fetchWorkers = async () => {
		try {
			setLoading(true);
			const response = await workersApi.getWorkersList({
				page: 1,
				pageSize: 100, // Get all workers for the widget
			});
			setWorkers(response.items);
		} catch (error) {
			console.error('Failed to fetch workers:', error);
		} finally {
			setLoading(false);
		}
	};

	// Initial fetch
	useEffect(() => {
		fetchWorkers();
	}, []);

	// Subscribe to real-time worker events
	useRealtimeRefresh({
		events: [
			B2F_WORKERS_UPDATED, // Emitted when worker state changes (task assigned/completed)
			B2F_WORKER_CONNECTED,
			B2F_WORKER_DISCONNECTED,
		],
		onEvent: fetchWorkers,
		logPrefix: 'WorkersWidget',
	});

	// Update durations every second for busy workers
	useEffect(() => {
		const hasBusyWorkers = workers.some(w => w.state === 'busy' && w.taskStartedAt);
		if (!hasBusyWorkers) return;

		const interval = setInterval(() => {
			setTick(prev => prev + 1);
		}, 1000);

		return () => clearInterval(interval);
	}, [workers]);

	// Filter out disconnected workers and sort: busy first, then idle
	const sortedWorkers = workers
		.filter(worker => worker.connected)
		.sort((a, b) => {
			// Busy workers (state === 'busy') come first
			if (a.state === 'busy' && b.state !== 'busy') return -1;
			if (a.state !== 'busy' && b.state === 'busy') return 1;
			return 0;
		});

	if (loading) {
		return (
			<div className="space-y-2 text-sm">
				<div className="flex items-center gap-2 font-medium text-muted-foreground">
					<Cpu className="size-4" />
					<span>Workers</span>
				</div>
				<div className="text-xs text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (sortedWorkers.length === 0) {
		return (
			<div className="space-y-2 text-sm">
				<div className="flex items-center gap-2 font-medium text-muted-foreground">
					<Cpu className="size-4" />
					<span>Workers</span>
				</div>
				<div className="text-xs text-muted-foreground">No workers connected</div>
			</div>
		);
	}

	return (
		<div className="space-y-2 text-sm">
			<div className="flex items-center gap-2 font-medium text-muted-foreground">
				<Cpu className="size-4" />
				<span>Workers</span>
			</div>

			<div className="space-y-2">
				{sortedWorkers.map(worker => (
					<div key={worker.workerId} className="space-y-0.5">
						<div className="flex items-center justify-between text-xs">
							<Link
								to="/workers"
								className="truncate hover:text-foreground hover:underline transition-colors"
							>
								{worker.workerId}
							</Link>
							{worker.state === 'busy' ? (
								<Zap className="size-3 shrink-0 text-yellow-500" />
							) : (
								<Hourglass className="size-3 shrink-0 text-muted-foreground" />
							)}
						</div>
						{worker.state === 'busy' && worker.taskId && (
							<div className="text-xs text-muted-foreground">
								-{' '}
								<Link
									to={`/tasks/${worker.taskId}`}
									className="hover:text-foreground hover:underline transition-colors"
								>
									{worker.taskId}
								</Link>
								{worker.taskStartedAt && (
									<span className="ml-1">({formatDuration(worker.taskStartedAt)})</span>
								)}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
