import { useEffect, useState } from 'react';

import type { ProjectStatusConfig } from '@shared/api/projects.contract';
import { DEFAULT_STATUS_CONFIG } from '@shared/api/projects.contract';

import { projectsApi } from '../projects/projects.api';

/**
 * ===========================================================================================
 * USE PROJECT STATUS CONFIG HOOK
 * ===========================================================================================
 *
 * Fetches the status configuration for a given project from GET /api/projects/:projectId/status-config.
 * Falls back to DEFAULT_STATUS_CONFIG while loading or on error.
 *
 * ===========================================================================================
 */

export interface UseProjectStatusConfigResult {
	config: ProjectStatusConfig;
	isLoading: boolean;
	error: Error | null;
}

export function useProjectStatusConfig(projectId: string | undefined): UseProjectStatusConfigResult {
	const [config, setConfig] = useState<ProjectStatusConfig>(DEFAULT_STATUS_CONFIG);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!projectId) {
			setConfig(DEFAULT_STATUS_CONFIG);
			setIsLoading(false);
			setError(null);
			return;
		}

		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);
				const fetchedConfig = await projectsApi.getStatusConfig(projectId);
				if (!abortController.signal.aborted) {
					setConfig(fetchedConfig);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch status config'));
					// Keep the default config so dropdowns remain usable
					setConfig(DEFAULT_STATUS_CONFIG);
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			abortController.abort();
		};
	}, [projectId]);

	return { config, isLoading, error };
}
