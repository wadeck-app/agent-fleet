import { useCallback, useEffect, useRef } from 'react';

import { useUrlState } from '@framework/hooks/useUrlState';
import type { Project } from '@shared/api/projects.contract';

/**
 * ===========================================================================================
 * USE PROJECTS V2 STATE - Active State Management with URL
 * ===========================================================================================
 *
 * Manages active project/workspace selection state with URL persistence.
 * Handles auto-selection logic and state synchronization using the generic useUrlState hook.
 *
 * Features:
 * - URL persistence via query parameters
 * - Auto-select first pinned project (if none selected)
 * - Automatic workspace reset when project changes (nested groups)
 * - Type-safe state management
 * - Browser history support (back/forward)
 *
 * URL Structure: /projects-v2?projectId=xxx&workspaceId=yyy&view=tasks
 *
 * Note: Auto-selection of first workspace is handled by ProjectsV2Page, not this hook.
 *
 * ===========================================================================================
 */

export interface ProjectsV2State {
	activeProjectId: string | null;
	activeWorkspaceId: string | null;
	activeView: 'tasks' | 'scripts';
}

export interface UseProjectsV2StateOptions {
	pinnedProjects: Project[];
}

export interface UseProjectsV2StateResult {
	state: ProjectsV2State;
	setActiveProject: (projectId: string) => void;
	setActiveWorkspace: (workspaceId: string) => void;
	setActiveView: (view: 'tasks' | 'scripts') => void;
	clearActiveWorkspace: () => void;
}

/**
 * Hook for managing ProjectsV2 active state with URL persistence
 */
export function useProjectsV2State({ pinnedProjects }: UseProjectsV2StateOptions): UseProjectsV2StateResult {
	// Project ID (simple independent parameter)
	const [projectId, setProjectId] = useUrlState({
		key: 'projectId',
		defaultValue: null as string | null,
	});

	// Workspace ID (nested under project - will be reset manually when project changes)
	const [workspaceId, setWorkspaceId] = useUrlState({
		key: 'workspaceId',
		defaultValue: null as string | null,
		// NOTE: Not using parentGroupId/parentValue here to avoid race condition
		// Instead, we reset workspaceId manually in setActiveProject
	});

	// View (simple independent parameter, defaults to 'tasks')
	const [view, setView] = useUrlState<'tasks' | 'scripts'>({
		key: 'view',
		defaultValue: 'tasks',
		cleanupDefault: true,
	});

	// Track if we've already done auto-selection
	const hasAutoSelected = useRef(false);

	// Auto-select first pinned project if none selected (ONLY on first mount)
	useEffect(() => {
		// Only auto-select on first mount, not on subsequent renders
		if (hasAutoSelected.current) {
			return;
		}

		if (pinnedProjects && pinnedProjects.length > 0 && !projectId) {
			setProjectId(pinnedProjects[0].id);
			hasAutoSelected.current = true;
		} else if (projectId) {
			// If there's already a projectId from URL, mark as handled
			hasAutoSelected.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pinnedProjects?.length]);

	const setActiveProject = useCallback(
		(newProjectId: string) => {
			console.log('[useProjectsV2State] setActiveProject called:', newProjectId, {
				currentProjectId: projectId,
				currentWorkspaceId: workspaceId,
			});
			setProjectId(newProjectId);
			setWorkspaceId(null);
			console.log('[useProjectsV2State] setActiveProject done (state update queued)');
		},
		[setProjectId, setWorkspaceId, projectId, workspaceId]
	);

	const setActiveWorkspace = useCallback(
		(newWorkspaceId: string) => {
			setWorkspaceId(newWorkspaceId);
		},
		[setWorkspaceId]
	);

	const setActiveView = useCallback(
		(newView: 'tasks' | 'scripts') => {
			setView(newView);
		},
		[setView]
	);

	const clearActiveWorkspace = useCallback(() => {
		setWorkspaceId(null);
	}, [setWorkspaceId]);

	return {
		state: {
			activeProjectId: projectId,
			activeWorkspaceId: workspaceId,
			activeView: view,
		},
		setActiveProject,
		setActiveWorkspace,
		setActiveView,
		clearActiveWorkspace,
	};
}
