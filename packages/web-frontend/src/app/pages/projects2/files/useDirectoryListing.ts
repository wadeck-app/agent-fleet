import { useCallback, useEffect, useState } from 'react';

import type { DirectoryListing, FileEntry } from '@shared/api/workspaceFiles.contract';

import { workspaceFilesApi } from './workspaceFiles.api';

interface UseDirectoryListingResult {
	entries: FileEntry[];
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

/**
 * Hook to load directory listing for a given workspace and path
 */
export function useDirectoryListing(workspaceId: string, path: string): UseDirectoryListingResult {
	const [entries, setEntries] = useState<FileEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const refresh = useCallback(async () => {
		if (!workspaceId || !path) {
			return;
		}

		try {
			setLoading(true);
			setError(null);
			const result: DirectoryListing = await workspaceFilesApi.listDirectory(workspaceId, path);
			setEntries(result.entries);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
			setEntries([]);
		} finally {
			setLoading(false);
		}
	}, [workspaceId, path]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return {
		entries,
		loading,
		error,
		refresh,
	};
}
