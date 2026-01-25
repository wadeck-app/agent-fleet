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

		// Generate componentId from logPrefix
		const componentId = logPrefix;

		// Build subscription specs
		const subscriptions = events.map(event => ({
			event,
			filters,
		}));

		// Set component subscription state (merged with other components)
		// This sends a single subscription_state message to the server
		transport.setComponentSubscriptionState?.(componentId, subscriptions);

		// Register event handlers locally
		// Use registerLocalHandler (if available) to avoid duplicate subscription messages
		// Otherwise fallback to subscribe() for transports that don't support state-based API
		const unsubscribers = events.map(event => {
			const handler = (data: any) => {
				console.log(`[${logPrefix}] Received event: ${event}`, data);
				onEventRef.current();
			};

			// Prefer registerLocalHandler for state-based subscriptions
			if (transport.registerLocalHandler) {
				return transport.registerLocalHandler(event as import('@shared/transport').EventType, handler);
			}

			// Fallback to subscribe() for transports without state-based support
			return transport.subscribe(event as import('@shared/transport').EventType, handler, filters);
		});

		// Cleanup: remove component subscriptions and unsubscribe handlers
		return () => {
			transport.removeComponentSubscriptions?.(componentId);
			unsubscribers.forEach(unsub => unsub());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transport, enabled, logPrefix, eventsKey, filtersKey]);
}
