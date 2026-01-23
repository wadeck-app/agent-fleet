import { useCallback, useState } from 'react';

import { arrayMove } from '@dnd-kit/sortable';
import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';

import { projectsApi } from '../pages/projects/projects.api';
import { workspacesApi } from '../pages/workspaces/workspaces.api';

/**
 * ===========================================================================================
 * USE PROJECT WORKSPACES - Project-Workspace Association Management Hook
 * ===========================================================================================
 *
 * Manages workspaces and their association with projects.
 * Handles loading, association, dissociation, and reordering.
 *
 * Features:
 * - Load all workspaces
 * - Associate/dissociate workspaces with projects
 * - Reorder workspaces within a project
 * - Get workspaces for a specific project (ordered)
 *
 * ===========================================================================================
 */

export interface UseProjectWorkspacesResult {
	workspaces: Workspace[];
	loading: boolean;
	error: string | null;
	loadWorkspaces: () => Promise<void>;
	associateWorkspace: (workspaceId: string, projectId: string) => Promise<void>;
	dissociateWorkspace: (workspaceId: string) => Promise<void>;
	reorderWorkspaces: (projectId: string, activeId: string, overId: string, projectVersion: number) => Promise<void>;
	getProjectWorkspaces: (project: Project | undefined) => Workspace[];
	clearError: () => void;
}

/**
 * Hook for managing workspaces and their project associations
 *
 * @returns Workspaces data, loading/error states, and mutation functions
 *
 * @example
 * ```typescript
 * const {
 *   workspaces,
 *   loading,
 *   associateWorkspace,
 *   dissociateWorkspace,
 *   reorderWorkspaces,
 *   getProjectWorkspaces
 * } = useProjectWorkspaces();
 *
 * const projectWorkspaces = getProjectWorkspaces(activeProject);
 * ```
 */
export function useProjectWorkspaces(): UseProjectWorkspacesResult {
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	/**
	 * Load all workspaces from API
	 */
	const loadWorkspaces = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await workspacesApi.getWorkspaces();
			setWorkspaces(response.workspaces);
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}, []);

	// Initial load
	useAbortableEffect(async _signal => {
		await loadWorkspaces();
	}, []);

	/**
	 * Associate a workspace with a project
	 * Backend handles bidirectional sync: updates both workspace.projectId AND project.workspaceIds
	 */
	const associateWorkspace = useCallback(
		async (workspaceId: string, projectId: string) => {
			try {
				setError(null);
				await workspacesApi.updateWorkspace(workspaceId, { projectId });

				// Reload to get fresh data
				await loadWorkspaces();
			} catch (err) {
				setError(getErrorMessage(err));
			}
		},
		[loadWorkspaces]
	);

	/**
	 * Dissociate a workspace from its project
	 * Backend handles bidirectional sync: updates both workspace.projectId AND project.workspaceIds
	 */
	const dissociateWorkspace = useCallback(
		async (workspaceId: string) => {
			try {
				setError(null);
				await workspacesApi.updateWorkspace(workspaceId, { projectId: null });

				// Reload to get fresh data
				await loadWorkspaces();
			} catch (err) {
				setError(getErrorMessage(err));
			}
		},
		[loadWorkspaces]
	);

	/**
	 * Reorder workspaces within a project
	 */
	const reorderWorkspaces = useCallback(
		async (projectId: string, activeId: string, overId: string, projectVersion: number) => {
			try {
				setError(null);

				// Get current project to access workspaceIds
				const project = await projectsApi.getProjectById(projectId);
				const currentOrder = [...project.workspaceIds];

				const oldIndex = currentOrder.indexOf(activeId);
				const newIndex = currentOrder.indexOf(overId);

				if (oldIndex === -1 || newIndex === -1) return;

				const reordered = arrayMove(currentOrder, oldIndex, newIndex);

				await projectsApi.updateProject(projectId, {
					workspaceIds: reordered,
					version: projectVersion,
				});

				// Reload to get fresh data
				await loadWorkspaces();
			} catch (err) {
				setError(getErrorMessage(err));
			}
		},
		[loadWorkspaces]
	);

	/**
	 * Get workspaces for a specific project, maintaining order from project.workspaceIds
	 */
	const getProjectWorkspaces = useCallback(
		(project: Project | undefined): Workspace[] => {
			if (!project || !project.workspaceIds || project.workspaceIds.length === 0) {
				return [];
			}

			return project.workspaceIds
				.map((id: string) => workspaces.find((w: Workspace) => w.id === id))
				.filter((w: Workspace | undefined): w is Workspace => w !== undefined);
		},
		[workspaces]
	);

	return {
		workspaces,
		loading,
		error,
		loadWorkspaces,
		associateWorkspace,
		dissociateWorkspace,
		reorderWorkspaces,
		getProjectWorkspaces,
		clearError,
	};
}
