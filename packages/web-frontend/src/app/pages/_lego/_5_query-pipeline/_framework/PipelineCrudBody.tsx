import { Button } from '@framework/components/primitives/Button';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import { renderColumnValue } from '@framework/lego/helpers/renderColumnValue';
import { Edit, Trash2 } from 'lucide-react';

import { usePipelineContext } from './PipelineContext';

/**
 * ===========================================================================================
 * PIPELINE CRUD BODY
 * ===========================================================================================
 *
 * Extends PipelineBody with CRUD actions column.
 * Renders table with Edit/Delete buttons for each row.
 *
 * Features:
 * - All features of PipelineBody
 * - Additional actions column with Edit/Delete buttons
 * - Reads data from PipelineContext
 *
 * ===========================================================================================
 */

export interface PipelineCrudBodyProps<T> {
	showPagination?: boolean;
	onEdit: (item: T) => void;
	onDelete: (item: T) => void;
}

export function PipelineCrudBody<T extends { id: string }>({
	showPagination = false,
	onEdit,
	onDelete,
}: PipelineCrudBodyProps<T>) {
	const { items, columns, loading, pagination, setPage, setPageSize } = usePipelineContext<T>();

	const tableColumns: TableColumn<T>[] = [
		...columns.map(col => ({
			key: col.key as string,
			label: col.label,
			render: (item: T) => renderColumnValue(col, item),
			sortable: col.sortable,
		})),
		{
			key: 'actions',
			label: 'Actions',
			render: (item: T) => (
				<div className="flex gap-2">
					<Button onClick={() => onEdit(item)} size="sm" variant="outline">
						<Edit className="size-3" />
					</Button>
					<Button onClick={() => onDelete(item)} size="sm" variant="destructive">
						<Trash2 className="size-3" />
					</Button>
				</div>
			),
		},
	];

	return (
		<Table
			data={items}
			columns={tableColumns}
			getItemId={(item: T) => item.id}
			loading={loading}
			emptyMessage="No items found"
			pagination={
				showPagination
					? {
							currentPage: pagination.page,
							totalPages: pagination.totalPages,
							totalItems: pagination.total,
							onPageChange: setPage,
							pageSize: pagination.pageSize,
							onPageSizeChange: setPageSize,
							pageSizeOptions: [10, 20, 50],
						}
					: undefined
			}
		/>
	);
}
