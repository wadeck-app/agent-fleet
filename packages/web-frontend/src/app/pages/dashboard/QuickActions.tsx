import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Eye, FolderOpen, Plus, Settings } from 'lucide-react';

/**
 * ===========================================================================================
 * QUICK ACTIONS - Dashboard Action Buttons
 * ===========================================================================================
 *
 * Provides quick access to common actions:
 * - New Task: Create a new task
 * - Manage Workers: Navigate to worker management
 * - Workspaces: Navigate to workspace management
 * - Review Queue: Navigate to tasks requiring review (with count badge)
 *
 * Icons:
 * - Plus (new task)
 * - Settings (manage workers)
 * - FolderOpen (workspaces)
 * - Eye (review queue)
 *
 * Layout: Horizontal row of buttons
 *
 * ===========================================================================================
 */

export interface QuickActionsProps {
	reviewQueueCount?: number;
	onNewTask?: () => void;
	onManageWorkers?: () => void;
	onWorkspaces?: () => void;
	onReviewQueue?: () => void;
}

export function QuickActions({
	reviewQueueCount = 0,
	onNewTask,
	onManageWorkers,
	onWorkspaces,
	onReviewQueue,
}: QuickActionsProps) {
	return (
		<div className="flex flex-wrap gap-3">
			{/* New Task */}
			<Button onClick={onNewTask} variant="default" size="sm">
				<Plus className="mr-2 size-4" />
				New Task
			</Button>

			{/* Manage Workers */}
			<Button onClick={onManageWorkers} variant="outline" size="sm">
				<Settings className="mr-2 size-4" />
				Manage Workers
			</Button>

			{/* Workspaces */}
			<Button onClick={onWorkspaces} variant="outline" size="sm">
				<FolderOpen className="mr-2 size-4" />
				Workspaces
			</Button>

			{/* Review Queue */}
			<Button
				onClick={onReviewQueue}
				variant="outline"
				size="sm"
				className={`
     relative
   `}
			>
				<Eye className="mr-2 size-4" />
				Review Queue
				{reviewQueueCount > 0 && (
					<Badge variant="destructive" className="ml-2 px-1.5 py-0 text-xs">
						{reviewQueueCount}
					</Badge>
				)}
			</Button>
		</div>
	);
}
