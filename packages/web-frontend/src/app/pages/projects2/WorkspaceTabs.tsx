import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import type { Workspace } from '@shared/api/workspaces.contract';
import { Settings } from 'lucide-react';

// Helper to extract basename from path
function getBasename(path: string): string {
	return path.split(/[/\\]/).pop() || path;
}

interface WorkspaceTabsProps {
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	onWorkspaceSelect: (workspaceId: string) => void;
	onManageClick: () => void;
}

export function WorkspaceTabs({ workspaces, activeWorkspaceId, onWorkspaceSelect, onManageClick }: WorkspaceTabsProps) {
	return (
		<div className="border-b border-border bg-muted/30">
			<div className="flex items-center justify-between px-4">
				<div className="flex items-center gap-1 overflow-x-auto">
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
									<Badge variant="secondary" className="text-xs">
										{workspace.tasksCount}
									</Badge>
								}
							>
								<span className="text-sm font-medium">{displayName}</span>
							</TabButton>
						);
					})}
				</div>
				<Button variant="default" size="sm" onClick={onManageClick}>
					<Settings />
					Manage Workspaces
				</Button>
			</div>
		</div>
	);
}
