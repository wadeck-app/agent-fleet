import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useDialogParam } from '@framework/hooks/useDialogParam';
import { getBasename } from '@framework/utils/pathUtils';
import type { Task } from '@shared/api/tasks.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { B2F_TASK_CREATED, B2F_TASK_DELETED, B2F_TASK_UPDATED } from '@shared/transport/B2FEventConstants';
import { FolderOpen, GitBranch, ListTodo, Pencil } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { CreateTaskDialog } from '../tasks/CreateTaskDialog';
import { TasksTable } from '../tasks/TasksTable';
import { tasksApi } from '../tasks/tasks.api';
import { EditWorkspaceDialog } from '../workspaces/EditWorkspaceDialog';
import { ScriptsPanel } from '../workspaces/scripts/ScriptsPanel';
import { WorkspaceScriptsInline } from '../workspaces/scripts/WorkspaceScriptsInline';
import { useCanCreateTaskFromWorkspace } from '../workspaces/useCanCreateTaskFromWorkspace';
import { workspacesApi } from '../workspaces/workspaces.api';
import { WorkspaceViewTabs } from './WorkspaceViewTabs';
import { FileBrowserPanel } from './files/FileBrowserPanel';

interface WorkspacePanelProps {
	workspace: Workspace;
	projectId: string;
	activeView: 'tasks' | 'scripts' | 'files';
	onViewChange: (view: 'tasks' | 'scripts' | 'files') => void;
}

export function WorkspacePanel({ workspace, projectId, activeView, onViewChange }: WorkspacePanelProps) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const editDialog = useDialogParam('edit-workspace');
	const createTaskDialog = useDialogParam('create-task');
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// Check if we can create task from this workspace
	const { canCreate, reason } = useCanCreateTaskFromWorkspace(workspace);

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
		data: { name?: string; description?: string; color?: string }
	) => {
		await workspacesApi.updateWorkspace(workspaceId, data);
	};

	const displayName = workspace.name || getBasename(workspace.path);

	const statusVariant = {
		active: 'success',
		locked: 'warning',
		cleaning: 'secondary',
		error: 'destructive',
		idle: 'outline',
	} as const;

	const statusTooltip = {
		active: 'A worker is connected to this workspace',
		idle: 'No worker currently connected',
		locked: 'Workspace is locked',
		cleaning: 'Workspace is being cleaned',
		error: 'Workspace is in error state',
	} as const;

	const modeVariant = {
		development: 'default',
		production: 'destructive',
		staging: 'warning',
	} as const;

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-full flex-col overflow-hidden">
				{/* Workspace Metadata Card */}
				<div className="border-b border-border bg-card p-4">
					<div className="flex items-center justify-between">
						<div className="flex flex-1 items-center gap-6">
							<h2 className="text-lg font-semibold">{displayName}</h2>
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge variant={statusVariant[workspace.status]}>{workspace.status}</Badge>
								</TooltipTrigger>
								<TooltipContent>
									<p>{statusTooltip[workspace.status]}</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge variant={modeVariant[workspace.mode]}>{workspace.mode}</Badge>
								</TooltipTrigger>
								<TooltipContent>
									<p>Workspace mode</p>
								</TooltipContent>
							</Tooltip>
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<FolderOpen className="h-4 w-4" />
								<span className="font-mono">{workspace.path}</span>
							</div>
							{workspace.gitBranch && (
								<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
									<GitBranch className="h-4 w-4" />
									<span className="font-mono">{workspace.gitBranch}</span>
								</div>
							)}
							{/* Inline Scripts Display */}
							<WorkspaceScriptsInline
								workspaceId={workspace.id}
								onScriptClick={scriptName => {
									console.log('[WorkspacePanel] Script clicked:', scriptName);

									// Build new URL with script name (encoded) and view parameter
									const newParams = new URLSearchParams(searchParams);
									newParams.set('layout', 'full');
									newParams.set('panels', encodeURIComponent(scriptName));
									newParams.set('view', 'scripts');

									// Switch to scripts view
									onViewChange('scripts');

									// Navigate with new params
									navigate(`?${newParams.toString()}`, { replace: true });
								}}
							/>
						</div>

						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={editDialog.open}>
								<Pencil className="h-4 w-4" />
								Edit
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={createTaskDialog.open}
								disabled={!canCreate}
								title={canCreate ? 'Create task for this workspace' : reason}
							>
								<ListTodo className="h-4 w-4" />
								Create Task
							</Button>
						</div>
					</div>
				</div>

				{/* View Mode Tabs */}
				<div className="flex flex-1 flex-col overflow-hidden">
					<WorkspaceViewTabs activeView={activeView} onViewChange={onViewChange} />

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

					{/* Files View */}
					{activeView === 'files' && (
						<div className="flex-1 overflow-hidden">
							<FileBrowserPanel workspaceId={workspace.id} />
						</div>
					)}
				</div>

				{/* Edit Workspace Dialog */}
				<EditWorkspaceDialog
					workspace={workspace}
					open={editDialog.isOpen}
					onClose={editDialog.close}
					onSave={handleWorkspaceSave}
				/>

				{/* Create Task Dialog */}
				<CreateTaskDialog
					open={createTaskDialog.isOpen}
					onOpenChange={createTaskDialog.onOpenChange}
					onSuccess={loadTasks}
					defaultValues={{
						workerId: workspace.activeWorkerId || '',
						projectId: workspace.projectId || '',
					}}
					lockedFields={['workerId', 'projectId']}
				/>
			</div>
		</TooltipProvider>
	);
}
