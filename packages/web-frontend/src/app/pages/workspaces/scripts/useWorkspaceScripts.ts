import { useCallback, useEffect, useRef, useState } from 'react';

import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';
import {
	B2F_SCRIPT_PROCESS_ERROR,
	B2F_SCRIPT_PROCESS_STARTED,
	B2F_SCRIPT_PROCESS_STOPPED,
	B2F_WORKSPACE_SCRIPT_CREATED,
	B2F_WORKSPACE_SCRIPT_DELETED,
	B2F_WORKSPACE_SCRIPT_UPDATED,
} from '@shared/transport/B2FEventConstants';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { workspaceScriptsApi } from './workspaceScripts.api';

interface UseWorkspaceScriptsOptions {
	workspaceId: string;
	enabled?: boolean;
}

interface UseWorkspaceScriptsResult {
	scripts: ScriptProcessWithConfig[];
	loading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/**
 * Hook for managing workspace scripts
 *
 * Features:
 * - Fetch scripts for a workspace
 * - Subscribe to B2F events for real-time updates
 * - Auto-refresh on script configuration and process changes
 *
 * @example
 * ```tsx
 * const { scripts, loading, error, refetch } = useWorkspaceScripts({
 *   workspaceId: 'workspace-123'
 * });
 * ```
 */
export function useWorkspaceScripts({
	workspaceId,
	enabled = true,
}: UseWorkspaceScriptsOptions): UseWorkspaceScriptsResult {
	const [scripts, setScripts] = useState<ScriptProcessWithConfig[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const isFirstFetch = useRef(true);

	// Fetch scripts from API
	const fetchScripts = useCallback(async () => {
		if (!enabled) return;

		try {
			// Only show loading on FIRST fetch, not on subsequent refetches (WebSocket updates)
			// This prevents the UI from flickering/hiding when scripts update
			if (isFirstFetch.current) {
				setLoading(true);
			}
			setError(null);
			const data = await workspaceScriptsApi.listWorkspaceScripts(workspaceId);
			setScripts(data);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to fetch workspace scripts'));
			console.error('[useWorkspaceScripts] Error fetching scripts:', err);
		} finally {
			if (isFirstFetch.current) {
				setLoading(false);
				isFirstFetch.current = false;
			}
		}
	}, [workspaceId, enabled]);

	// Initial load
	useEffect(() => {
		fetchScripts();
	}, [fetchScripts]);

	// Subscribe to real-time updates
	useRealtimeRefresh({
		events: [
			B2F_WORKSPACE_SCRIPT_CREATED,
			B2F_WORKSPACE_SCRIPT_UPDATED,
			B2F_WORKSPACE_SCRIPT_DELETED,
			B2F_SCRIPT_PROCESS_STARTED,
			B2F_SCRIPT_PROCESS_STOPPED,
			B2F_SCRIPT_PROCESS_ERROR,
		],
		onEvent: fetchScripts,
		filters: { workspaceId },
		enabled,
		logPrefix: 'useWorkspaceScripts',
	});

	return {
		scripts,
		loading,
		error,
		refetch: fetchScripts,
	};
}
