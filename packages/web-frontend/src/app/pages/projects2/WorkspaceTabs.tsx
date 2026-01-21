import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { Workspace } from '@shared/api/workspaces.contract';

// Helper to extract basename from path
function getBasename(path: string): string {
	return path.split(/[/\\]/).pop() || path;
}

interface WorkspaceTabsProps {
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	onWorkspaceSelect: (workspaceId: string) => void;
}

export function WorkspaceTabs({ workspaces, activeWorkspaceId, onWorkspaceSelect }: WorkspaceTabsProps) {
	return (
		<div className="border-b border-border bg-muted/30">
			<div className="flex items-center gap-1 overflow-x-auto px-4">
				{workspaces.map(workspace => {
					const displayName = workspace.name || getBasename(workspace.path);

					return (
						<Button
							key={workspace.id}
							variant="ghost"
							onClick={() => onWorkspaceSelect(workspace.id)}
							className={`
         flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors
         hover:bg-accent/50
         ${
				activeWorkspaceId === workspace.id
					? 'border-primary bg-accent/30 text-foreground'
					: `
       border-transparent text-muted-foreground
       hover:text-foreground
     `
			}
       `}
						>
							{workspace.color && (
								<div
									className="h-3 w-3 rounded-full border border-border"
									style={{ backgroundColor: workspace.color }}
									title={workspace.color}
								/>
							)}
							<span className="text-sm font-medium">{displayName}</span>
							<Badge variant="secondary" className="text-xs">
								{workspace.tasksCount}
							</Badge>
						</Button>
					);
				})}
			</div>
		</div>
	);
}
