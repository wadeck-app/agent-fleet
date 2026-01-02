import { useState } from 'react';

import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import type { Workspace } from '@shared/api/workspaces.contract';
import { Pencil } from 'lucide-react';

import { workspacesApi } from '../workspaces/workspaces.api';
import { EditWorkspaceDialog } from './EditWorkspaceDialog';

/**
 * Workspaces table column definitions
 */
export const WORKSPACES_TABLE2_COLUMNS: Table2Column<Workspace>[] = [
	{
		key: 'name',
		label: 'Name',
		render: (w: Workspace) => (
			<span className={w.name ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
				{w.name || 'Unnamed'}
			</span>
		),
	},
	{
		key: 'path',
		label: 'Path',
		render: (w: Workspace) => <span className="font-mono text-xs text-muted-foreground">{w.path}</span>,
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
			} as const;

			return (
				<Badge variant={variantMap[w.status]} className="font-medium">
					{w.status}
				</Badge>
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

export interface WorkspacesTable2Props extends Partial<Table2Props<Workspace>> {
	// Add any custom props if needed
}

/**
 * Workspaces table component using Table2
 */
export function WorkspacesTable2(props: WorkspacesTable2Props) {
	const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
	const { showToast } = useToast();

	const handleSave = async (workspaceId: string, data: { name?: string; description?: string }) => {
		await workspacesApi.updateWorkspace(workspaceId, data);
		// Cache will auto-refresh via useRealtimeRefresh subscription to B2F_WORKSPACE_UPDATED

		// Show success toast
		showToast('Workspace updated successfully', 'success');
	};

	// Add Actions column dynamically
	const columnsWithActions: Table2Column<Workspace>[] = [
		...WORKSPACES_TABLE2_COLUMNS,
		{
			key: 'actions',
			label: 'Actions',
			render: (w: Workspace) => (
				<Button variant="ghost" size="sm" onClick={() => setEditingWorkspace(w)}>
					<Pencil className="h-4 w-4" />
				</Button>
			),
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
		</>
	);
}
