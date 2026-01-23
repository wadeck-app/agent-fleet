import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import type { Task } from '@shared/api/tasks.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { B2F_TASK_CREATED, B2F_TASK_DELETED, B2F_TASK_UPDATED } from '@shared/transport/B2FEventConstants';
import { FolderOpen, GitBranch, Pencil } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { TasksTable } from '../tasks/TasksTable';
import { tasksApi } from '../tasks/tasks.api';
import { EditWorkspaceDialog } from '../workspaces/EditWorkspaceDialog';
import { ScriptsPanel } from '../workspaces/scripts/ScriptsPanel';
import { workspacesApi } from '../workspaces/workspaces.api';

// Helper to extract basename from path
function getBasename(path: string): string {
	return path.split(/[/\\]/).pop() || path;
}

interface WorkspacePanelProps {
	workspace: Workspace;
	projectId: string;
	activeView: 'tasks' | 'scripts';
	onViewChange: (view: 'tasks' | 'scripts') => void;
}

export function WorkspacePanel({ workspace, projectId, activeView, onViewChange }: WorkspacePanelProps) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	// Load tasks
	const loadTasks = async () => {
		try {
			setRefreshing(true);
			const response = await tasksApi.getTasks();
			setTasks(response.tasks);
		} catch (error) {
			console.error('Failed to load tasks:', error);
		} finally {
			setRefreshing(false);
		}
	};

	// Initial load
	useEffect(() => {
		loadTasks();
	}, []);

	// Subscribe to real-time task updates
	useRealtimeRefresh({
		events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
		onEvent: loadTasks,
		logPrefix: 'WorkspacePanel',
	});

	// Filter tasks by project and workspace
	const filteredTasks = useMemo(() => {
		return tasks.filter((task: Task) => task.projectId === projectId && task.workspaceId === workspace.id);
	}, [tasks, projectId, workspace.id]);

	// Handle workspace edit
	const handleWorkspaceSave = async (
		workspaceId: string,
		data: { name?: string; description?: string; color?: string; projectId?: string | null }
	) => {
		await workspacesApi.updateWorkspace(workspaceId, data);
	};

	const displayName = workspace.name || getBasename(workspace.path);

	const statusVariant = {
		active: 'success',
		locked: 'warning',
		cleaning: 'secondary',
		error: 'destructive',
	} as const;

	const modeVariant = {
		development: 'default',
		production: 'destructive',
		staging: 'warning',
	} as const;

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Workspace Metadata Card */}
			<div className="border-b border-border bg-card p-4">
				<div className="flex items-start justify-between">
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-3">
							<h2 className="text-lg font-semibold">{displayName}</h2>
							<Badge variant={statusVariant[workspace.status]}>{workspace.status}</Badge>
							<Badge variant={modeVariant[workspace.mode]}>{workspace.mode}</Badge>
						</div>

						{workspace.description && (
							<p className="text-sm text-muted-foreground">{workspace.description}</p>
						)}

						<div className="flex items-center gap-4 text-sm text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<FolderOpen className="h-4 w-4" />
								<span className="font-mono">{workspace.path}</span>
							</div>
							{workspace.gitBranch && (
								<div className="flex items-center gap-1.5">
									<GitBranch className="h-4 w-4" />
									<span className="font-mono">{workspace.gitBranch}</span>
								</div>
							)}
						</div>

						{workspace.gitStatus && (
							<div className="flex items-center gap-3 text-xs">
								{workspace.gitStatus.ahead > 0 && (
									<span className="text-success">↑ {workspace.gitStatus.ahead} ahead</span>
								)}
								{workspace.gitStatus.behind > 0 && (
									<span className="text-warning">↓ {workspace.gitStatus.behind} behind</span>
								)}
								{workspace.gitStatus.modified > 0 && (
									<span className="text-muted-foreground">
										{workspace.gitStatus.modified} modified
									</span>
								)}
								{workspace.gitStatus.untracked > 0 && (
									<span className="text-muted-foreground">
										{workspace.gitStatus.untracked} untracked
									</span>
								)}
							</div>
						)}
					</div>

					<Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
						<Pencil className="h-4 w-4" />
						Edit
					</Button>
				</div>
			</div>

			{/* View Mode Tabs */}
			<div className="flex flex-1 flex-col overflow-hidden">
				<div className="border-b border-border bg-card">
					<div className="flex items-center gap-1 px-4">
						<TabButton active={activeView === 'tasks'} onClick={() => onViewChange('tasks')}>
							Tasks
						</TabButton>
						<TabButton active={activeView === 'scripts'} onClick={() => onViewChange('scripts')}>
							Scripts
						</TabButton>
					</div>
				</div>

				{/* Tasks View */}
				{activeView === 'tasks' && (
					<div className="flex-1 overflow-hidden p-4">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-sm font-semibold">Tasks ({filteredTasks.length})</h3>
						</div>

						<div className="h-[calc(100%-2rem)] overflow-auto">
							{filteredTasks.length > 0 ? (
								<TasksTable data={filteredTasks} refreshing={refreshing} />
							) : (
								<div className="flex h-full items-center justify-center">
									<div className="text-center">
										<div className="mb-2 text-4xl text-muted-foreground">📋</div>
										<p className="text-sm text-muted-foreground">No tasks in this workspace</p>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Scripts View */}
				{activeView === 'scripts' && (
					<div className="flex-1 overflow-hidden">
						<ScriptsPanel workspaceId={workspace.id} />
					</div>
				)}
			</div>

			{/* Edit Workspace Dialog */}
			<EditWorkspaceDialog
				workspace={workspace}
				open={isEditDialogOpen}
				onClose={() => setIsEditDialogOpen(false)}
				onSave={handleWorkspaceSave}
			/>
		</div>
	);
}
