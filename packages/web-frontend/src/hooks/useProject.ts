import type { Project } from '@shared/api/projects.contract';
import { useAsyncData } from '@framework/hooks/useAsyncData';

import { projectsApi } from '../app/pages/projects/projects.api';

/**
 * Hook to fetch a single project by ID
 *
 * @param projectId - The project ID to fetch (undefined to skip fetch)
 * @returns Object containing project data, loading state, and error
 *
 * @example
 * ```tsx
 * const { project, isLoading, error } = useProject(projectId);
 *
 * if (error) return <div>Error loading project</div>;
 * if (isLoading) return <div>Loading...</div>;
 * if (!project) return null;
 *
 * return <div>{project.name}</div>;
 * ```
 */
export function useProject(projectId: string | undefined) {
	const { data, loading, error } = useAsyncData(
		() => {
			if (!projectId) {
				return Promise.resolve(null);
			}
			return projectsApi.getProjectById(projectId);
		},
		[projectId]
	);

	return {
		project: data,
		isLoading: loading,
		error,
	};
}
