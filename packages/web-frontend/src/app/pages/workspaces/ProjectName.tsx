import { useWorkspaceProject } from '@/hooks/useWorkspaceProject';

/**
 * Component to display project name for a workspace
 */
export function ProjectName({ workspaceId }: { workspaceId: string }) {
	const { project, isLoading } = useWorkspaceProject(workspaceId);

	if (isLoading) {
		return <span className="text-sm text-muted-foreground">Loading...</span>;
	}

	return <span className="text-sm">{project?.name || '-'}</span>;
}
