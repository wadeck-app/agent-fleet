import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { Project } from '@shared/api/projects.contract';

/**
 * ===========================================================================================
 * USE PROJECTS V2 STATE - Active State Management with URL and localStorage
 * ===========================================================================================
 *
 * Manages active project/workspace selection state with URL and localStorage persistence.
 * Handles auto-selection logic and state synchronization.
 *
 * Features:
 * - URL persistence (primary) via query parameters
 * - localStorage persistence (fallback)
 * - Auto-select first pinned project
 * - Auto-select first workspace in project
 * - Type-safe state management
 * - Browser history support (back/forward)
 *
 * URL Structure: /projects-v2?projectId=xxx&workspaceId=yyy&view=tasks
 *
 * Priority: URL params > localStorage > auto-selection
 *
 * ===========================================================================================
 */

export interface ProjectsV2State {
	activeProjectId: string | null;
	activeWorkspaceId: string | null;
	activeView: 'tasks' | 'scripts';
}

const STORAGE_KEY = 'projects-v2-active-state';

/**
 * Load active state from localStorage
 */
function loadActiveState(): ProjectsV2State {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error('Failed to load ProjectsV2 active state:', error);
	}
	return {
		activeProjectId: null,
		activeWorkspaceId: null,
		activeView: 'tasks',
	};
}

/**
 * Save active state to localStorage
 */
function saveActiveState(state: ProjectsV2State): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (error) {
		console.error('Failed to save ProjectsV2 active state:', error);
	}
}

export interface UseProjectsV2StateOptions {
	/**
	 * Pinned projects list for auto-selection
	 */
	pinnedProjects: Project[];

	/**
	 * Project workspaces list for auto-selection
	 */
	projectWorkspaces: Array<{ id: string }>;

	/**
	 * Currently active project ID (for auto-selecting workspace)
	 */
	activeProjectId: string | null;
}

export interface UseProjectsV2StateResult {
	state: ProjectsV2State;
	setActiveProject: (projectId: string) => void;
	setActiveWorkspace: (workspaceId: string) => void;
	setActiveView: (view: 'tasks' | 'scripts') => void;
	clearActiveWorkspace: () => void;
}

/**
 * Hook for managing ProjectsV2 active state with URL and localStorage persistence
 *
 * @param options - Configuration options
 * @returns State and setter functions
 *
 * @example
 * ```typescript
 * const { state, setActiveProject, setActiveWorkspace, setActiveView } = useProjectsV2State({
 *   pinnedProjects,
 *   projectWorkspaces,
 *   activeProjectId: state.activeProjectId
 * });
 * ```
 */
export function useProjectsV2State({
	pinnedProjects,
	projectWorkspaces,
	activeProjectId,
}: UseProjectsV2StateOptions): UseProjectsV2StateResult {
	const [searchParams, setSearchParams] = useSearchParams();
	const [state, setState] = useState<ProjectsV2State>(() => {
		// Priority 1: URL params
		const projectIdParam = searchParams.get('projectId');
		const workspaceIdParam = searchParams.get('workspaceId');
		const viewParam = searchParams.get('view');

		if (projectIdParam) {
			return {
				activeProjectId: projectIdParam,
				activeWorkspaceId: workspaceIdParam,
				activeView: viewParam === 'scripts' ? 'scripts' : 'tasks',
			};
		}

		// Priority 2: localStorage
		return loadActiveState();
	});

	// Track if this is the first render to avoid unnecessary URL updates
	const isFirstRender = useRef(true);

	// Sync URL with state changes (skip first render to avoid loops)
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}

		const newParams = new URLSearchParams();

		if (state.activeProjectId) {
			newParams.set('projectId', state.activeProjectId);
		}

		if (state.activeWorkspaceId) {
			newParams.set('workspaceId', state.activeWorkspaceId);
		}

		if (state.activeView !== 'tasks') {
			newParams.set('view', state.activeView);
		}

		// Update URL without causing navigation
		setSearchParams(newParams, { replace: true });

		// Also save to localStorage as fallback
		saveActiveState(state);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.activeProjectId, state.activeWorkspaceId, state.activeView, setSearchParams]);

	// Auto-select first pinned project if none selected
	useEffect(() => {
		if (pinnedProjects && pinnedProjects.length > 0 && !state.activeProjectId) {
			setState(prev => ({
				...prev,
				activeProjectId: pinnedProjects[0].id,
			}));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pinnedProjects?.length, state.activeProjectId]);

	// Auto-select first workspace if project has workspaces and none selected
	useEffect(() => {
		if (activeProjectId && projectWorkspaces && projectWorkspaces.length > 0 && !state.activeWorkspaceId) {
			setState(prev => ({
				...prev,
				activeWorkspaceId: projectWorkspaces[0].id,
			}));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeProjectId, projectWorkspaces?.length, state.activeWorkspaceId]);

	const setActiveProject = useCallback((projectId: string) => {
		setState(prev => ({
			...prev,
			activeProjectId: projectId,
			activeWorkspaceId: null, // Clear workspace when changing project
		}));
	}, []);

	const setActiveWorkspace = useCallback((workspaceId: string) => {
		setState(prev => ({
			...prev,
			activeWorkspaceId: workspaceId,
		}));
	}, []);

	const setActiveView = useCallback((view: 'tasks' | 'scripts') => {
		setState(prev => ({
			...prev,
			activeView: view,
		}));
	}, []);

	const clearActiveWorkspace = useCallback(() => {
		setState(prev => ({
			...prev,
			activeWorkspaceId: null,
		}));
	}, []);

	return {
		state,
		setActiveProject,
		setActiveWorkspace,
		setActiveView,
		clearActiveWorkspace,
	};
}
