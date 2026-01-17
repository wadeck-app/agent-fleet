import { useEffect, useMemo, useRef } from 'react';

import { useTransport } from '@/transport';

/**
 * Reusable hook for subscribing to real-time events and triggering refreshes
 *
 * This hook simplifies the pattern of subscribing to B2F (Backend-to-Frontend) events
 * and automatically handling subscription/unsubscription lifecycle.
 *
 * Features:
 * - Automatic subscription on mount
 * - Automatic unsubscription on unmount
 * - Centralized logging
 * - Support for multiple events
 * - Conditional enabling
 * - Server-side event filtering (for performance)
 *
 * @example
 * ```tsx
 * // Subscribe to task events and refresh cache when they occur
 * useRealtimeRefresh({
 *   events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
 *   onEvent: cache.actions.refresh,
 *   logPrefix: 'TasksPage',
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Subscribe with filters (e.g., only trace updates for specific taskId)
 * useRealtimeRefresh({
 *   events: [B2F_TASK_TRACE_UPDATED],
 *   onEvent: refetchLogs,
 *   filters: { taskId: 'task-123' },
 *   logPrefix: 'TaskLogsPage',
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Conditional subscription (e.g., only when WebSocket is enabled)
 * useRealtimeRefresh({
 *   events: [B2F_DASHBOARD_UPDATED],
 *   onEvent: refresh,
 *   enabled: useWebSocket && enabled,
 *   logPrefix: 'Dashboard',
 * });
 * ```
 */
export function useRealtimeRefresh(options: {
	/**
	 * Array of B2F event constants to subscribe to
	 * @example [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED]
	 */
	events: string[];

	/**
	 * Callback function to execute when any of the events is received
	 * Typically cache.actions.refresh or a custom refresh function
	 */
	onEvent: () => void;

	/**
	 * Optional filters for server-side event filtering
	 * Reduces network traffic by only receiving events matching criteria
	 * @example { taskId: 'task-123' } for B2F_TASK_TRACE_UPDATED
	 */
	filters?: Record<string, unknown>;

	/**
	 * Whether subscriptions are enabled
	 * @default true
	 */
	enabled?: boolean;

	/**
	 * Prefix for console logs to identify which component is subscribing
	 * @default 'Page'
	 */
	logPrefix?: string;
}) {
	const { transport } = useTransport();
	const { events, onEvent, filters, enabled = true, logPrefix = 'Page' } = options;

	// Use ref to always have the latest onEvent callback without causing re-subscriptions
	const onEventRef = useRef(onEvent);
	onEventRef.current = onEvent;

	// Stabilize events and filters arrays using stringified comparison
	// This prevents infinite loops when arrays are created inline in component render
	const eventsKey = useMemo(() => JSON.stringify(events), [events]);
	const filtersKey = useMemo(() => (filters ? JSON.stringify(filters) : null), [filters]);

	useEffect(() => {
		// Don't subscribe if disabled
		if (!enabled) return;

		const logMessage = filters
			? `[${logPrefix}] Subscribing to real-time events with filters: ${JSON.stringify(filters)}`
			: `[${logPrefix}] Subscribing to real-time events`;
		console.log(logMessage, events);

		// Subscribe to all events and collect unsubscribe functions
		// Type assertion needed because transport.subscribe has strict event type checking
		const unsubscribers = events.map(event =>
			transport.subscribe(
				event as import('@shared/transport').EventType,
				data => {
					console.log(`[${logPrefix}] Received event: ${event}`, data);
					// Use ref to access latest callback without causing re-subscription
					onEventRef.current();
				},
				filters // Pass filters to transport
			)
		);

		// Cleanup: unsubscribe from all events
		return () => {
			console.log(`[${logPrefix}] Unsubscribing from real-time events`);
			unsubscribers.forEach(unsub => unsub());
		};
		// Only re-subscribe when transport, enabled, logPrefix, or the actual content of events/filters changes
		// NOT when onEvent reference changes (use ref instead)
		// NOT when events/filters array reference changes (use stringified keys instead)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transport, enabled, logPrefix, eventsKey, filtersKey]);
}
