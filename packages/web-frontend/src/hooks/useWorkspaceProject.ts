import { useProjects } from '@app/hooks/useProjects';

/**
 * Hook to find the project that contains a specific workspace
 *
 * @param workspaceId - The workspace ID to find the project for
 * @returns Object containing project data and loading state
 *
 * @example
 * ```tsx
 * const { project, isLoading } = useWorkspaceProject(workspaceId);
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (!project) return <span>No project</span>;
 *
 * return <div>{project.name}</div>;
 * ```
 */
export function useWorkspaceProject(workspaceId: string | undefined) {
	const { projects, loading } = useProjects();

	const project = workspaceId ? projects.find(p => p.workspaceIds?.includes(workspaceId)) : undefined;

	return {
		project,
		isLoading: loading,
	};
}
