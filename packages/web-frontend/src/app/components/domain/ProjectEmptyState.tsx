import { Button } from '@framework/components/primitives/Button';
import { Settings } from 'lucide-react';

/**
 * ===========================================================================================
 * PROJECT EMPTY STATE - Domain Component
 * ===========================================================================================
 *
 * Empty state component for when no projects are selected/pinned.
 * Domain-specific component for ProjectsV2Page.
 *
 * ===========================================================================================
 */

export interface ProjectEmptyStateProps {
	onManageClick: () => void;
}

/**
 * Empty state component for no selected projects
 *
 * @example
 * ```typescript
 * <ProjectEmptyState onManageClick={() => setIsManageDialogOpen(true)} />
 * ```
 */
export function ProjectEmptyState({ onManageClick }: ProjectEmptyStateProps) {
	return (
		<div className="flex h-full items-center justify-center px-6">
			<div className="text-center">
				<div className="mb-4 text-4xl text-muted-foreground">📂</div>
				<h3 className="mb-2 text-lg font-semibold">No Projects Selected</h3>
				<p className="mb-4 text-sm text-muted-foreground">Select projects to view their workspaces and tasks</p>
				<Button onClick={onManageClick}>
					<Settings className="mr-2 h-4 w-4" />
					Manage Projects
				</Button>
			</div>
		</div>
	);
}
