import { useCallback, useEffect, useRef, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';

/**
 * ===========================================================================================
 * USE FLOW DAEMON RESOURCE
 * ===========================================================================================
 *
 * Generic "load a read-only resource" hook shared by the flow daemon pages.
 * - Loads on mount and whenever `fetcher` changes (memoize it with useCallback)
 * - Ignores responses of superseded requests (filter changed while a request was in flight)
 * - Optional silent polling (no loading flag, so the UI does not flicker)
 * - Error text is the backend's actionable `error` message (ApiError), never a generic one
 *
 * ===========================================================================================
 */

export interface FlowDaemonResource<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

interface ResourceState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
}

export function useFlowDaemonResource<T>(fetcher: () => Promise<T>, pollIntervalMs?: number): FlowDaemonResource<T> {
	const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });
	const latestRequestId = useRef(0);

	const load = useCallback(
		async (showLoading: boolean) => {
			latestRequestId.current += 1;
			const requestId = latestRequestId.current;
			if (showLoading) {
				setState(previous => ({ ...previous, loading: true }));
			}
			try {
				const data = await fetcher();
				if (requestId === latestRequestId.current) {
					setState({ data, loading: false, error: null });
				}
			} catch (err) {
				if (requestId === latestRequestId.current) {
					setState({ data: null, loading: false, error: getErrorMessage(err) });
				}
			}
		},
		[fetcher]
	);

	useEffect(() => {
		load(true);
		const timer =
			pollIntervalMs === undefined
				? undefined
				: setInterval(() => {
						load(false);
					}, pollIntervalMs);

		return () => {
			if (timer !== undefined) {
				clearInterval(timer);
			}
			// Invalidate in-flight requests: no state update after unmount or fetcher change
			latestRequestId.current += 1;
		};
	}, [load, pollIntervalMs]);

	const refresh = useCallback(() => {
		load(true);
	}, [load]);

	return { ...state, refresh };
}
