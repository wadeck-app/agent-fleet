import { useCallback, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Project } from '@shared/api/projects.contract';

import { projectsApi } from '../pages/projects/projects.api';

/**
 * ===========================================================================================
 * USE PROJECTS - Projects Data Management Hook
 * ===========================================================================================
 *
 * Manages projects data fetching and mutations.
 * Extracts API calls and business logic from pages.
 *
 * Features:
 * - Race condition protection
 * - Optimistic updates for reordering
 * - Pin/unpin functionality
 * - Automatic sorting (pinned first, by order)
 *
 * ===========================================================================================
 */

export interface UseProjectsResult {
	projects: Project[];
	loading: boolean;
	error: string | null;
	pinnedProjects: Project[];
	loadProjects: () => Promise<void>;
	pinProject: (projectId: string, currentVersion: number) => Promise<void>;
	unpinProject: (projectId: string, currentVersion: number) => Promise<void>;
	reorderProjects: (activeId: string, overId: string) => Promise<void>;
	clearError: () => void;
}

/**
 * Hook for managing projects list and operations
 *
 * @returns Projects data, loading/error states, and mutation functions
 *
 * @example
 * ```typescript
 * const {
 *   projects,
 *   loading,
 *   pinnedProjects,
 *   pinProject,
 *   unpinProject,
 *   reorderProjects
 * } = useProjects();
 * ```
 */
export function useProjects(): UseProjectsResult {
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	/**
	 * Sort projects: pinned first (by order), then unpinned
	 */
	const sortProjects = useCallback((projectsList: Project[]): Project[] => {
		return [...projectsList].sort((a, b) => {
			if (a.pinned && !b.pinned) return -1;
			if (!a.pinned && b.pinned) return 1;
			if (a.pinned && b.pinned) return (a.order || 0) - (b.order || 0);
			return 0;
		});
	}, []);

	/**
	 * Load projects from API
	 */
	const loadProjects = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await projectsApi.getProjectsList({});

			// Handle both response types: ProjectsListResponse (items) or ProjectsData (projects)
			const projectsList = 'items' in response ? response.items : (response as { projects: Project[] }).projects;

			const sortedProjects = sortProjects(projectsList);
			setProjects(sortedProjects);
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [sortProjects]);

	// Initial load
	useAbortableEffect(async _signal => {
		await loadProjects();
	}, []);

	/**
	 * Pin a project (mark as pinned and assign order)
	 */
	const pinProject = useCallback(
		async (projectId: string, currentVersion: number) => {
			const project = projects.find(p => p.id === projectId);
			if (!project) return;

			if (project.pinned) {
				// Already pinned, nothing to do
				return;
			}

			const pinnedProjects = projects.filter(p => p.pinned);
			const maxOrder = pinnedProjects.length > 0 ? Math.max(...pinnedProjects.map(p => p.order || 0)) : -1;

			try {
				await projectsApi.updateProject(projectId, {
					pinned: true,
					order: maxOrder + 1,
					version: currentVersion,
				});

				// Reload to get fresh data
				await loadProjects();
			} catch (err) {
				setError(getErrorMessage(err));
			}
		},
		[projects, loadProjects]
	);

	/**
	 * Unpin a project (mark as not pinned)
	 */
	const unpinProject = useCallback(
		async (projectId: string, currentVersion: number) => {
			try {
				await projectsApi.updateProject(projectId, {
					pinned: false,
					version: currentVersion,
				});

				// Reload to get fresh data
				await loadProjects();
			} catch (err) {
				setError(getErrorMessage(err));
			}
		},
		[loadProjects]
	);

	/**
	 * Reorder pinned projects via drag-and-drop
	 */
	const reorderProjects = useCallback(
		async (activeId: string, overId: string) => {
			const pinnedProjectsList = projects.filter(p => p.pinned);
			const oldIndex = pinnedProjectsList.findIndex(p => p.id === activeId);
			const newIndex = pinnedProjectsList.findIndex(p => p.id === overId);

			if (oldIndex === -1 || newIndex === -1) {
				return;
			}

			// Reorder the array
			const reordered = [...pinnedProjectsList];
			const [moved] = reordered.splice(oldIndex, 1);
			reordered.splice(newIndex, 0, moved);

			// Optimistic update: Update local state immediately
			const updatedProjects = projects.map(project => {
				const reorderedIndex = reordered.findIndex(p => p.id === project.id);
				if (reorderedIndex !== -1) {
					return { ...project, order: reorderedIndex };
				}
				return project;
			});

			const sortedProjects = sortProjects(updatedProjects);
			setProjects(sortedProjects);

			// Update order field for all affected projects
			const updates = reordered.map((project, index) => ({
				id: project.id,
				order: index,
				pinned: true,
				version: project.version,
			}));

			// Send updates to server
			try {
				await Promise.all(
					updates.map(update =>
						projectsApi.updateProject(update.id, {
							order: update.order,
							pinned: update.pinned,
							version: update.version,
						})
					)
				);
			} catch (err) {
				setError(getErrorMessage(err));
				// Revert on error by reloading
				await loadProjects();
			}
		},
		[projects, sortProjects, loadProjects]
	);

	const pinnedProjects = projects.filter(p => p.pinned);

	return {
		projects,
		loading,
		error,
		pinnedProjects,
		loadProjects,
		pinProject,
		unpinProject,
		reorderProjects,
		clearError,
	};
}
