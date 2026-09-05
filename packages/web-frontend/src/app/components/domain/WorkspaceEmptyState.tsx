import { Button } from '@framework/components/primitives/Button';
import { Settings } from 'lucide-react';

/**
 * ===========================================================================================
 * WORKSPACE EMPTY STATE - Domain Component
 * ===========================================================================================
 *
 * Empty state component for when a project has no linked workspaces.
 * Domain-specific component for ProjectsV2Page.
 *
 * ===========================================================================================
 */

interface WorkspaceEmptyStateProps {
	onManageClick?: () => void;
}

export function WorkspaceEmptyState({ onManageClick }: WorkspaceEmptyStateProps) {
	return (
		<div className="flex h-full items-center justify-center px-6">
			<div className="text-center">
				<div className="mb-4 text-4xl text-muted-foreground"></div>
				<h3 className="mb-2 text-lg font-semibold">No Workspaces Linked</h3>
				<p className="mb-4 text-sm text-muted-foreground">This project has no workspaces associated with it</p>
				{onManageClick && (
					<Button variant="default" onClick={onManageClick}>
						<Settings />
						Manage Workspaces
					</Button>
				)}
			</div>
		</div>
	);
}
