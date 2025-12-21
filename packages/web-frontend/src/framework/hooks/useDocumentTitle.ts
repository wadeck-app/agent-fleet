import { useEffect } from 'react';

import { useWorkspaceId } from '@app/features/workspace/useWorkspaceId';

export interface UseDocumentTitleOptions {
	workspacePrefix?: boolean;
	appName?: string;
}

/**
 * Custom hook to set the document title with workspace prefix
 * Automatically adds [WS#] prefix when WORKSPACE_ID != 0
 *
 * @param {string} title - The base title for the page
 * @param {UseDocumentTitleOptions} options - Optional configuration
 *
 * @example
 * useDocumentTitle('Ingredients'); // WORKSPACE_ID=0 → "Ingredients - Boilerplate"
 * useDocumentTitle('Ingredients'); // WORKSPACE_ID=2 → "[WS2] Ingredients - Boilerplate"
 */
export function useDocumentTitle(title: string, options: UseDocumentTitleOptions = {}) {
	const { workspacePrefix = true, appName = 'Boilerplate' } = options;
	const workspaceId = useWorkspaceId();

	useEffect(() => {
		// Build the full title
		const prefix = workspacePrefix && workspaceId > 0 ? `[WS${workspaceId}] ` : '';
		document.title = `${prefix}${title} - ${appName}`;

		// Cleanup: reset to default when component unmounts
		return () => {
			document.title = appName;
		};
	}, [title, workspaceId, workspacePrefix, appName]);
}
