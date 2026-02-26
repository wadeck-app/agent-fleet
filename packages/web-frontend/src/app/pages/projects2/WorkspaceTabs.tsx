import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import { TabGroup } from '@framework/components/primitives/TabGroup';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { getBasename } from '@framework/utils/pathUtils';
import type { Workspace } from '@shared/api/workspaces.contract';
import { FolderPlus, Pencil, Settings } from 'lucide-react';

interface WorkspaceTabsProps {
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	onWorkspaceSelect: (workspaceId: string) => void;
	onEditProjectClick?: () => void;
	onManageClick?: () => void;
	onCreateWorkspaceClick?: () => void;
}

export function WorkspaceTabs({
	workspaces,
	activeWorkspaceId,
	onWorkspaceSelect,
	onEditProjectClick,
	onManageClick,
	onCreateWorkspaceClick,
}: WorkspaceTabsProps) {
	return (
		<TooltipProvider delayDuration={300}>
			<TabGroup
				variant="default"
				emptyMessage="No workspaces configured yet"
				actions={
					(onEditProjectClick || onManageClick || onCreateWorkspaceClick) && (
						<div className="flex items-center gap-2">
							{onCreateWorkspaceClick && (
								<Button variant="default" size="sm" onClick={onCreateWorkspaceClick}>
									<FolderPlus />
									Create Workspace
								</Button>
							)}
							{onEditProjectClick && (
								<Button variant="default" size="sm" onClick={onEditProjectClick}>
									<Pencil />
									Edit Project
								</Button>
							)}
							{onManageClick && (
								<Button variant="default" size="sm" onClick={onManageClick}>
									<Settings />
									Manage Workspaces
								</Button>
							)}
						</div>
					)
				}
			>
				{workspaces.map(workspace => {
					const displayName = workspace.name || getBasename(workspace.path);

					return (
						<TabButton
							key={workspace.id}
							active={activeWorkspaceId === workspace.id}
							onClick={() => onWorkspaceSelect(workspace.id)}
							icon={
								workspace.color && (
									<div
										className="h-3 w-3 rounded-full border border-border"
										style={{ backgroundColor: workspace.color }}
										title={workspace.color}
									/>
								)
							}
							badge={
								<Tooltip>
									<TooltipTrigger asChild>
										<Badge variant="secondary" className="text-xs">
											{workspace.tasksCount}
										</Badge>
									</TooltipTrigger>
									<TooltipContent>
										<p>Number of tasks in this workspace</p>
									</TooltipContent>
								</Tooltip>
							}
						>
							<span className="text-sm font-medium">{displayName}</span>
						</TabButton>
					);
				})}
			</TabGroup>
		</TooltipProvider>
	);
}
