import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import { renderColumnValue } from '@framework/lego';

import { usePipelineContext } from './PipelineContext';

/**
 * ===========================================================================================
 * PIPELINE BODY
 * ===========================================================================================
 *
 * Renders the table body for pipeline data table.
 * Reads data from PipelineContext.
 *
 * ===========================================================================================
 */

export interface PipelineBodyProps<T> {
	showPagination?: boolean;
	onRowClick?: (item: T) => void;
	showCursor?: boolean;
}

export function PipelineBody<T extends { id: string }>({
	showPagination = false,
	onRowClick,
	showCursor = false,
}: PipelineBodyProps<T> = {}) {
	const { items, columns, loading, pagination, setPage, setPageSize } = usePipelineContext<T>();

	const tableColumns: TableColumn<T>[] = columns.map(col => ({
		key: col.key as string,
		label: col.label,
		render: (item: T) => renderColumnValue(col, item),
		sortable: col.sortable,
	}));

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
			onRowClick={onRowClick}
			getRowClassName={showCursor ? () => 'cursor-pointer hover:bg-accent/20' : undefined}
		/>
	);
}
