import { useCallback, useState } from 'react';

import type { ScriptProcess, ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';

import { workspaceScriptsApi } from './workspaceScripts.api';

interface UseScriptProcessOptions {
	workspaceId: string;
	scriptId: string;
}

interface UseScriptProcessResult {
	process: ScriptProcess | undefined;
	starting: boolean;
	stopping: boolean;
	restarting: boolean;
	error: Error | null;
	start: () => Promise<void>;
	stop: () => Promise<void>;
	restart: () => Promise<void>;
}

/**
 * Hook for controlling a single script process
 *
 * Features:
 * - Start/stop/restart actions
 * - Loading states for each action
 * - Error handling
 *
 * @example
 * ```tsx
 * const { process, start, stop, restart, starting } = useScriptProcess({
 *   workspaceId: 'workspace-123',
 *   scriptId: 'script-456'
 * });
 * ```
 */
export function useScriptProcess({ workspaceId, scriptId }: UseScriptProcessOptions): UseScriptProcessResult {
	const [process, setProcess] = useState<ScriptProcess | undefined>(undefined);
	const [starting, setStarting] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [restarting, setRestarting] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Start script
	const start = useCallback(async () => {
		try {
			setStarting(true);
			setError(null);
			const updatedProcess = await workspaceScriptsApi.startScript(workspaceId, scriptId);
			setProcess(updatedProcess);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to start script'));
			console.error('[useScriptProcess] Error starting script:', err);
		} finally {
			setStarting(false);
		}
	}, [workspaceId, scriptId]);

	// Stop script
	const stop = useCallback(async () => {
		try {
			setStopping(true);
			setError(null);
			const updatedProcess = await workspaceScriptsApi.stopScript(workspaceId, scriptId);
			setProcess(updatedProcess);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to stop script'));
			console.error('[useScriptProcess] Error stopping script:', err);
		} finally {
			setStopping(false);
		}
	}, [workspaceId, scriptId]);

	// Restart script
	const restart = useCallback(async () => {
		try {
			setRestarting(true);
			setError(null);
			const updatedProcess = await workspaceScriptsApi.restartScript(workspaceId, scriptId);
			setProcess(updatedProcess);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to restart script'));
			console.error('[useScriptProcess] Error restarting script:', err);
		} finally {
			setRestarting(false);
		}
	}, [workspaceId, scriptId]);

	return {
		process,
		starting,
		stopping,
		restarting,
		error,
		start,
		stop,
		restart,
	};
}

/**
 * Helper hook to extract process from ScriptProcessWithConfig
 */
export function useScriptProcessFromConfig(config: ScriptProcessWithConfig | undefined): ScriptProcess | undefined {
	return config?.process;
}
