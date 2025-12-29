import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import type { Workspace } from '@shared/api/workspaces.contract';

/**
 * Workspaces table column definitions
 */
export const WORKSPACES_TABLE2_COLUMNS: Table2Column<Workspace>[] = [
	{
		key: 'path',
		label: 'Path',
		render: (w: Workspace) => (
			<span
				className={`
    font-mono text-xs text-muted-foreground
  `}
			>
				{w.path}
			</span>
		),
	},
	{
		key: 'mode',
		label: 'Mode',
		render: (w: Workspace) => (
			<Badge
				variant={w.mode === 'production' ? 'destructive' : 'default'}
				className={`
     font-medium
   `}
			>
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
		render: (w: Workspace) => <span className="text-sm">{w.gitBranch || '-'}</span>,
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
	return (
		<Table2
			columns={WORKSPACES_TABLE2_COLUMNS}
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
	);
}
