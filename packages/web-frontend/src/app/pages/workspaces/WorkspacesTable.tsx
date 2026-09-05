import { useState } from 'react';

import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import type { Workspace } from '@shared/api/workspaces.contract';
import { ListTodo, Pencil } from 'lucide-react';

import { CreateTaskDialog } from '../tasks/CreateTaskDialog';
import { workspacesApi } from '../workspaces/workspaces.api';
import { EditWorkspaceDialog } from './EditWorkspaceDialog';
import { ProjectName } from './ProjectName';
import { useCanCreateTaskFromWorkspace } from './useCanCreateTaskFromWorkspace';

/**
 * Workspaces table column definitions
 */
export const WORKSPACES_TABLE2_COLUMNS: Table2Column<Workspace>[] = [
	{
		key: 'name',
		label: 'Name',
		render: (w: Workspace) => (
			<div className="flex items-center gap-2">
				{w.color && (
					<div
						className="h-4 w-4 rounded-full border border-border"
						style={{ backgroundColor: w.color }}
						title={w.color}
					/>
				)}
				<span className={w.name ? 'text-sm font-medium' : `text-sm text-muted-foreground`}>
					{w.name || 'Unnamed'}
				</span>
			</div>
		),
	},
	{
		key: 'path',
		label: 'Path',
		render: (w: Workspace) => <span className={`font-mono text-xs text-muted-foreground`}>{w.path}</span>,
	},
	{
		key: 'project',
		label: 'Project',
		render: (w: Workspace) => <ProjectName workspaceId={w.id} />,
	},
	{
		key: 'description',
		label: 'Description',
		render: (w: Workspace) => <span className="text-sm text-muted-foreground">{w.description || '-'}</span>,
	},
	{
		key: 'mode',
		label: 'Mode',
		render: (w: Workspace) => (
			<Badge variant={w.mode === 'production' ? 'destructive' : 'default'} className={`font-medium`}>
				{w.mode}
			</Badge>
		),
	},
	{
		key: 'status',
		label: 'Status',
		render: (w: Workspace) => {
			const variantMap = {
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

			return (
				<TooltipProvider delayDuration={300}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge variant={variantMap[w.status]} className="font-medium">
								{w.status}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							<p>{statusTooltip[w.status]}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		},
	},
	{
		key: 'gitBranch',
		label: 'Git Branch',
		render: (w: Workspace) => <span className="font-mono text-sm">{w.gitBranch || '-'}</span>,
	},
	{
		key: 'tasksCount',
		label: 'Tasks',
		render: (w: Workspace) => <span className="text-sm font-medium">{w.tasksCount}</span>,
	},
];

export interface WorkspacesTableProps extends Partial<Table2Props<Workspace>> {
	// Add any custom props if needed
}

/**
 * Workspaces table component using Table2
 */
export function WorkspacesTable(props: WorkspacesTableProps) {
	const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
	const [creatingTaskForWorkspace, setCreatingTaskForWorkspace] = useState<Workspace | null>(null);

	const handleSave = async (workspaceId: string, data: { name?: string; description?: string; color?: string }) => {
		await workspacesApi.updateWorkspace(workspaceId, data);
		// Cache will auto-refresh via useRealtimeRefresh subscription to B2F_WORKSPACE_UPDATED
		// Toast is now shown by EditWorkspaceDialog
	};

	// Add Actions column dynamically
	const columnsWithActions: Table2Column<Workspace>[] = [
		...WORKSPACES_TABLE2_COLUMNS,
		{
			key: 'actions',
			label: 'Actions',
			render: (w: Workspace) => {
				// eslint-disable-next-line react-hooks/rules-of-hooks
				const { canCreate, reason } = useCanCreateTaskFromWorkspace(w);

				return (
					<div className="flex gap-2">
						<Button variant="ghost" size="sm" onClick={() => setEditingWorkspace(w)} title="Edit workspace">
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setCreatingTaskForWorkspace(w)}
							disabled={!canCreate}
							title={canCreate ? 'Create task' : reason}
						>
							<ListTodo className="h-4 w-4" />
						</Button>
					</div>
				);
			},
		},
	];

	return (
		<>
			<Table2
				columns={columnsWithActions}
				getItemId={(w: Workspace) => w.id}
				emptyMessage="No workspaces found."
				data={props.data ?? []}
				isLoading={props.isLoading ?? false}
				error={props.error ?? null}
				pagination={props.pagination}
				sorting={props.sorting}
				features={props.features}
				refreshing={props.refreshing}
			/>

			{editingWorkspace && (
				<EditWorkspaceDialog
					workspace={editingWorkspace}
					open={!!editingWorkspace}
					onClose={() => setEditingWorkspace(null)}
					onSave={handleSave}
				/>
			)}

			{creatingTaskForWorkspace && (
				<CreateTaskDialog
					open={!!creatingTaskForWorkspace}
					onOpenChange={open => !open && setCreatingTaskForWorkspace(null)}
					onSuccess={() => {
						// Toast is shown by CreateTaskDialog
						setCreatingTaskForWorkspace(null);
					}}
					defaultValues={{
						workerId: creatingTaskForWorkspace.activeWorkerId || '',
						projectId: creatingTaskForWorkspace.projectId || '',
					}}
					lockedFields={['workerId', 'projectId']}
				/>
			)}
		</>
	);
}
