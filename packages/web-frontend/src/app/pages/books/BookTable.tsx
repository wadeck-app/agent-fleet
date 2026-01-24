import { CrudTable, type CrudTableConfig } from '@framework/components/advanced';
import { type TablePaginationConfig } from '@framework/components/table/Table';
import { type TableSortingConfig } from '@framework/components/table/Table';
import { ColumnHelpers } from '@framework/utils/table/ColumnHelpers';
import { defineColumns } from '@framework/utils/table/ColumnHelpers';
import type { Book } from '@shared/api/books.contract';

/**
 * ===========================================================================================
 * BOOK TABLE - Feature Component
 * ===========================================================================================
 *
 * Pure presentation component for displaying books in a table.
 * - Receives data via props
 * - Emits events via callbacks
 * - No direct API calls
 * - Focused on domain presentation
 * - Uses CrudTable for consistent CRUD operations
 *
 * ===========================================================================================
 */

export interface BookTableProps {
	/** Unique identifier for persistent state (sorting, visibility, etc.) */
	storageId: string;
	books: Book[];
	onDelete: (id: string) => void;
	onEdit?: (book: Book) => void;
	pagination?: TablePaginationConfig;
	sorting?: TableSortingConfig;
	visibleColumns?: Set<string>;
	/** Column order (array of column keys) for reordering */
	columnOrder?: string[];
	refreshing?: boolean;
	deleting?: boolean;
	/** Selection props */
	selectable?: boolean;
	selectedIds?: Set<string>;
	onSelectionChange?: (selectedIds: Set<string>) => void;
	/** IDs being deleted (for strike-through styling) */
	deletingIds?: Set<string>;
}

// Export column definitions as single source of truth for column configuration
export const BOOK_TABLE_COLUMNS = defineColumns<Book>([
	...ColumnHelpers.metadata(),
	ColumnHelpers.string('title', 'Title', { fontWeight: 'semibold', defaultVisible: true }),
	ColumnHelpers.string('author', 'Author', { defaultVisible: true }),
	// Custom render for ISBN to apply monospace and muted styling only to cells (not header)
	{
		key: 'isbn',
		label: 'ISBN',
		render: (book: Book) => <span className={`font-mono text-sm text-muted-foreground`}>{book.isbn}</span>,
		sortable: true,
		canHide: true,
		defaultVisible: true,
	},
	ColumnHelpers.numeric('publishedYear', 'Year', { align: 'center', defaultVisible: true }),
	ColumnHelpers.string('genre', 'Genre', {
		textColor: 'text-muted-foreground',
		defaultVisible: true,
	}),
	ColumnHelpers.numeric('pages', 'Pages', { align: 'right', defaultVisible: true }),
]);

const BOOK_TABLE_CONFIG: CrudTableConfig<Book> = {
	getItemDisplayName: book => book.title,
	emptyMessage: 'No books found. Add your first book to get started.',
	itemTypeName: 'book',
	editButtonVariant: 'outline',
};

export function BookTable({
	storageId,
	books,
	onDelete,
	onEdit,
	pagination,
	sorting,
	visibleColumns,
	columnOrder,
	refreshing,
	deleting,
	selectable,
	selectedIds,
	onSelectionChange,
	deletingIds,
}: BookTableProps) {
	return (
		<CrudTable
			storageId={storageId}
			data={books}
			columns={BOOK_TABLE_COLUMNS}
			config={BOOK_TABLE_CONFIG}
			onDelete={onDelete}
			onEdit={onEdit}
			pagination={pagination}
			sorting={sorting}
			visibleColumns={visibleColumns}
			columnOrder={columnOrder}
			refreshing={refreshing}
			deleting={deleting}
			selectable={selectable}
			selectedIds={selectedIds}
			onSelectionChange={onSelectionChange}
			deletingIds={deletingIds}
		/>
	);
}
