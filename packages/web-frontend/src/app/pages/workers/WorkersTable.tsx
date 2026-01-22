import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { EditableText } from '@framework/components/forms/EditableText';
import { Badge } from '@framework/components/primitives/Badge';
import { useToast } from '@framework/features/toast/ToastContext';
import type { MutationMethods } from '@framework/types/MutationContract';
import type { Worker } from '@shared/api/workers.contract';

import { workersService } from '@/app/pages/workers/WorkersService';

/**
 * Workers table column definitions factory
 * Creates columns with access to mutation methods and toast
 */
function createWorkersColumns(
	mutation?: MutationMethods<Worker>,
	showToast?: (message: string, type: 'success' | 'error') => void
): Table2Column<Worker>[] {
	/**
	 * Handle worker rename with optimistic update
	 */
	const handleRenameWorker = async (worker: Worker, newName: string) => {
		try {
			// Pass version for optimistic locking (1 for first rename when no metadata exists)
			const version = worker.version ?? 1;

			// Call backend and get updated worker
			const updatedWorker = await workersService.renameWorker(worker.workerId, newName, version);

			// Immediately update cache with backend response (optimistic update)
			mutation?.updateItem(updatedWorker);

			console.log('[WorkersTable] Updated worker via mutation.updateItem:', updatedWorker.workerId);
			// Real-time update via WebSocket (B2F_WORKER_UPDATED) will update other frontends

			// Show success toast
			showToast?.('Worker renamed successfully', 'success');
		} catch (error) {
			console.error('Failed to rename worker:', error);
			throw error; // Re-throw to show error in EditableText
		}
	};

	return [
		{
			key: 'workerId',
			label: 'Worker ID',
			render: (w: Worker) => (
				<span
					className={`
     font-mono text-xs text-muted-foreground
   `}
				>
					{w.workerId}
				</span>
			),
		},
		{
			key: 'name',
			label: 'Name',
			render: (w: Worker) => (
				<EditableText
					value={w.name}
					placeholder="Set name..."
					onSave={newName => handleRenameWorker(w, newName)}
					maxLength={100}
					displayClassName="text-sm font-medium"
				/>
			),
		},
		{
			key: 'state',
			label: 'State',
			render: (w: Worker) => (
				<Badge
					variant={w.state === 'busy' ? 'warning' : 'success'}
					className={`
      font-medium
    `}
				>
					{w.state === 'busy' ? 'Busy' : 'Idle'}
				</Badge>
			),
		},
		{
			key: 'connected',
			label: 'Connection',
			render: (w: Worker) => (
				<Badge
					variant={w.connected ? 'success' : 'destructive'}
					className={`
      font-medium
    `}
				>
					{w.connected ? 'Connected' : 'Disconnected'}
				</Badge>
			),
		},
		{
			key: 'taskId',
			label: 'Current Task',
			render: (w: Worker) => <span className="text-sm">{w.taskId || '-'}</span>,
			sortable: false,
		},
	];
}

export interface WorkersTableProps extends Partial<Table2Props<Worker>> {
	// Add any custom props if needed
}

/**
 * Workers table component using Table2
 * Receives mutation methods from Data2 for optimistic updates
 */
export function WorkersTable(props: WorkersTableProps) {
	const { showToast } = useToast();

	// Create columns with mutation support and toast
	const columns = createWorkersColumns(props.mutation, showToast);

	return (
		<Table2
			columns={columns}
			getItemId={(w: Worker) => w.workerId}
			emptyMessage="No workers found."
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
