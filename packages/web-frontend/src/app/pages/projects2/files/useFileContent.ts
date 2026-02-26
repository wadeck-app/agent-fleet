import { useCallback, useEffect, useState } from 'react';

import type { FileContent } from '@shared/api/workspaceFiles.contract';

import { workspaceFilesApi } from './workspaceFiles.api';

interface UseFileContentResult {
	content: string;
	loading: boolean;
	error: Error | null;
	save: (newContent: string) => Promise<void>;
	refresh: () => Promise<void>;
}

/**
 * Hook to load and save file content for a given workspace and path
 */
export function useFileContent(workspaceId: string, path: string | null): UseFileContentResult {
	const [content, setContent] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const refresh = useCallback(async () => {
		if (!workspaceId || !path) {
			setContent('');
			return;
		}

		try {
			setLoading(true);
			setError(null);
			const result: FileContent = await workspaceFilesApi.readFileContent(workspaceId, path);
			setContent(result.content);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
			setContent('');
		} finally {
			setLoading(false);
		}
	}, [workspaceId, path]);

	const save = useCallback(
		async (newContent: string) => {
			if (!workspaceId || !path) {
				throw new Error('Cannot save without workspace and path');
			}

			try {
				setLoading(true);
				setError(null);
				const result: FileContent = await workspaceFilesApi.writeFileContent(workspaceId, path, newContent);
				setContent(result.content);
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)));
				throw err;
			} finally {
				setLoading(false);
			}
		},
		[workspaceId, path]
	);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return {
		content,
		loading,
		error,
		save,
		refresh,
	};
}
