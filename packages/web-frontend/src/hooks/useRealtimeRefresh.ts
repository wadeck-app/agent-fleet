import { useEffect } from 'react';

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
 *
 * @example
 * ```tsx
 * // Subscribe to task events and refresh cache when they occur
 * useRealtimeRefresh({
 *   events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
 *   onEvent: cache.actions.refresh,
 *   logPrefix: 'TasksPage2',
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
	const { events, onEvent, enabled = true, logPrefix = 'Page' } = options;

	useEffect(() => {
		// Don't subscribe if disabled
		if (!enabled) return;

		console.log(`[${logPrefix}] Subscribing to real-time events:`, events);

		// Subscribe to all events and collect unsubscribe functions
		// Type assertion needed because transport.subscribe has strict event type checking
		const unsubscribers = events.map(event =>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			transport.subscribe(event as any, data => {
				console.log(`[${logPrefix}] Received event: ${event}`, data);
				onEvent();
			})
		);

		// Cleanup: unsubscribe from all events
		return () => {
			console.log(`[${logPrefix}] Unsubscribing from real-time events`);
			unsubscribers.forEach(unsub => unsub());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transport, onEvent, enabled, logPrefix, ...events]);
}
