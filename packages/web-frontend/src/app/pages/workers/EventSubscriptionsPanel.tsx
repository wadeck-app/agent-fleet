import { useEffect, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Card } from '@framework/components/primitives/Card';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { EventSubscriptionItem } from '@shared/api/workers.contract';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { workersApi } from './workers.api';

/**
 * ===========================================================================================
 * EVENT SUBSCRIPTIONS PANEL
 * ===========================================================================================
 *
 * Displays all active event subscriptions registered by workers for event-triggered flows.
 * Refreshes automatically when workers connect or disconnect via WebSocket events.
 *
 * Features:
 * - Real-time refresh on worker connection state changes
 * - Compact table display with inline filter badges
 * - Empty state for no active subscriptions
 * - Monospace formatting for event names, worker IDs, and flow IDs
 *
 * ===========================================================================================
 */
export function EventSubscriptionsPanel() {
	const [subscriptions, setSubscriptions] = useState<EventSubscriptionItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchSubscriptions = async () => {
		try {
			setIsLoading(true);
			setError(null);
			const response = await workersApi.getEventSubscriptions();
			setSubscriptions(response.subscriptions);
		} catch (err) {
			console.error('[EventSubscriptionsPanel] Failed to fetch event subscriptions:', err);
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	};

	// Initial fetch on mount
	useEffect(() => {
		void fetchSubscriptions();
	}, []);

	// Subscribe to worker connection events
	useRealtimeRefresh({
		events: [B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
		onEvent: fetchSubscriptions,
		logPrefix: 'EventSubscriptionsPanel',
	});

	if (error) {
		return (
			<Card className="p-6 mt-6">
				<h2 className="text-lg font-semibold mb-4">Event Subscriptions</h2>
				<p className="text-sm text-destructive">Error: {error}</p>
			</Card>
		);
	}

	if (isLoading && subscriptions.length === 0) {
		return (
			<Card className="p-6 mt-6">
				<h2 className="text-lg font-semibold mb-4">Event Subscriptions</h2>
				<p className="text-sm text-muted-foreground">Loading...</p>
			</Card>
		);
	}

	if (subscriptions.length === 0) {
		return (
			<Card className="p-6 mt-6">
				<h2 className="text-lg font-semibold mb-4">Event Subscriptions</h2>
				<p className="text-sm text-muted-foreground">No active event subscriptions</p>
			</Card>
		);
	}

	return (
		<Card className="p-6 mt-6">
			<h2 className="text-lg font-semibold mb-4">Event Subscriptions</h2>

			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b border-border">
							<th className="text-left text-sm font-medium text-muted-foreground pb-2 pr-4">Event</th>
							<th className="text-left text-sm font-medium text-muted-foreground pb-2 pr-4">Filter</th>
							<th className="text-left text-sm font-medium text-muted-foreground pb-2 pr-4">Project</th>
							<th className="text-left text-sm font-medium text-muted-foreground pb-2 pr-4">Worker</th>
							<th className="text-left text-sm font-medium text-muted-foreground pb-2">Flow</th>
						</tr>
					</thead>
					<tbody>
						{subscriptions.map((sub, index) => (
							<tr
								key={`${sub.workerId}-${sub.flowId}-${sub.event}-${index}`}
								className="border-b border-border last:border-0"
							>
								<td className="py-3 pr-4">
									<span className="font-mono text-xs">{sub.event}</span>
								</td>
								<td className="py-3 pr-4">
									{!sub.filter || Object.keys(sub.filter).length === 0 ? (
										<span className="text-sm text-muted-foreground">--</span>
									) : (
										<div className="flex flex-wrap gap-1">
											{Object.entries(sub.filter).map(([key, value]) => (
												<Badge key={key} variant="outline" className="text-xs">
													{key}={value}
												</Badge>
											))}
										</div>
									)}
								</td>
								<td className="py-3 pr-4">
									<span className="font-mono text-xs text-muted-foreground">{sub.projectId}</span>
								</td>
								<td className="py-3 pr-4">
									<span className="font-mono text-xs text-muted-foreground">{sub.workerId}</span>
								</td>
								<td className="py-3">
									<span className="font-mono text-xs text-muted-foreground">{sub.flowId}</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
}
