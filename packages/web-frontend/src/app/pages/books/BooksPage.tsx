import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { EmptyState } from '@framework/components/feedback/EmptyState';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { usePagination } from '@framework/components/pagination/usePagination';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { useSorting } from '@framework/components/table/useSorting';
import { useTableRefreshing } from '@framework/components/table/useTableRefreshing';
import { useBulkDeleteState } from '@framework/hooks/useBulkDeleteState';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { useMutationCleanup } from '@framework/hooks/useMutationCleanup';
import { useRoutedDialog } from '@framework/hooks/useRoutedDialog';
import { toColumnVisibilityDefs } from '@framework/utils/table/ColumnConfig';
import { extractColumnIds } from '@framework/utils/table/ColumnConfig';
import { extractDefaultVisible } from '@framework/utils/table/ColumnConfig';
import { extractCanHideConstraints } from '@framework/utils/table/ColumnConfig';
import type { Book } from '@shared/api/books.contract';
import { BookOpen, Plus, Trash2 } from 'lucide-react';

import { BookDialog, BulkDeleteWorkflow } from '@app/components/domain';

import { BOOK_TABLE_COLUMNS, BookTable } from './BookTable';
import { useBookSearch } from './useBookSearch';
import { useBooks } from './useBooks';

/**
 * ===========================================================================================
 * BOOKS PAGE - Clean Architecture
 * ===========================================================================================
 *
 * This page demonstrates proper architectural separation:
 * - Business logic extracted to useBooks hook
 * - Presentation delegated to feature components
 * - UI components are reusable and generic
 * - Page is compositional only (minimal styling)
 * - Tailwind CSS for all styling
 * - Dialog-based form with URL routing support
 *
 * Data Flow:
 * API → Service → Hook → Page → Components
 *
 * Routing:
 * - /books → List view
 * - /books/new → Create dialog
 * - /books/:id/edit → Edit dialog
 *
 * ===========================================================================================
 */

export function BooksPage() {
	const { id, mode } = useParams<{ id?: string; mode?: string }>();
	const navigate = useNavigate();

	// 🧩 Composable hooks - each feature is independent!
	const storageId = 'books-table';
	const pagination = usePagination({ pageSize: 10, storageId: 'books' });
	const sorting = useSorting({ storageId });
	// Search with pagination reset
	const search = useBookSearch({
		onSearchChange: () => pagination.setPage(1),
	});
	// Use column definitions from BookTable as single source of truth
	const columnVisibility = useColumnVisibility(extractColumnIds(BOOK_TABLE_COLUMNS), {
		storageId,
		defaultVisible: extractDefaultVisible(BOOK_TABLE_COLUMNS),
		constraints: extractCanHideConstraints(BOOK_TABLE_COLUMNS),
	});
	// Column ordering with drag & drop
	const columnOrder = useColumnOrder({
		storageId,
		defaultOrder: extractColumnIds(BOOK_TABLE_COLUMNS),
	});
	// Multi-row selection state (persists across pagination during session)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	// Bulk delete state management (centralized hook eliminates ~60 lines of boilerplate)
	const bulkDelete = useBulkDeleteState();
	// Track if dialog refresh is in progress (for loading state in dialog)
	const [isDialogRefreshing, setIsDialogRefreshing] = useState(false);

	// Convert sort configs to backend format
	const sortBy = sorting.sortConfigs.map(c => c.key).join(',');
	const sortOrder = sorting.sortConfigs.map(c => c.direction).join(',');

	const {
		books,
		loading,
		error,
		pagination: paginationData,
		createBook,
		updateBook,
		patchBook,
		deleteBook,
		bulkDeleteBooks,
		checkISBN,
		refreshBook,
		clearError,
		totalCount,
		loadBooks,
	} = useBooks({
		page: pagination.currentPage,
		pageSize: pagination.pageSize,
		sortBy: sortBy || undefined,
		sortOrder: sortOrder || undefined,
		search: search.searchQuery || undefined,
	});

	// Track refreshing state for blur effect
	const isRefreshing = useTableRefreshing(
		{
			page: pagination.currentPage,
			pageSize: pagination.pageSize,
			sortBy,
			sortOrder,
			search: search.searchQuery,
		},
		loading
	);

	// Show error as toast automatically
	useErrorToast({ error, clearError });

	// Success toast helper
	const successToast = useCrudSuccessToast('book');

	// Handle URL-based dialog routing
	const { isOpen, editingItem: editingBook } = useRoutedDialog<Book>({
		mode: mode as 'new' | 'edit' | undefined,
		id,
		items: books,
		findItem: (items, id) => items.find(b => b.id === id),
		onNavigateBack: () => navigate('/books'),
	});

	// Handle delete (confirmation is managed by CrudTable's internal dialog)
	const handleDelete = async (id: string) => {
		bulkDelete.actions.setDeletingIds(new Set([...bulkDelete.state.deletingIds, id]));
		try {
			await deleteBook(id);
			successToast.deleted();
		} finally {
			const next = new Set(bulkDelete.state.deletingIds);
			next.delete(id);
			bulkDelete.actions.setDeletingIds(next);
		}
	};

	// Automatic cleanup after mutation completes (eliminates ~10 lines of useEffect boilerplate)
	useMutationCleanup({
		data: books,
		isMutating: bulkDelete.state.isMutating,
		onCleanup: () => bulkDelete.actions.clear(),
	});

	const handleEdit = (book: Book) => {
		navigate(`/books/${book.id}/edit`);
	};

	const handleSubmit = async (data: Parameters<typeof createBook>[0]) => {
		const isEditing = !!editingBook;
		if (editingBook) {
			// Find the latest version from the books array
			const latestBook = books.find(b => b.id === editingBook.id);
			const version = latestBook?.version ?? editingBook.version;
			await updateBook(editingBook.id, { ...data, version });
		} else {
			await createBook(data);
		}
		navigate('/books');

		// Show success toast
		if (isEditing) {
			successToast.updated();
		} else {
			successToast.created();
		}
	};

	const handleNewBook = () => {
		navigate('/books/new');
	};

	const handleRefresh = async () => {
		if (editingBook) {
			setIsDialogRefreshing(true);
			try {
				await refreshBook(editingBook.id);
			} finally {
				setIsDialogRefreshing(false);
			}
		}
	};

	const handlePatchISBN = async (id: string, data: Parameters<typeof patchBook>[1]) => {
		return await patchBook(id, data);
	};

	const handleBulkDelete = async () => {
		if (selectedIds.size === 0) return;
		bulkDelete.actions.openDialog();
	};

	// Current params for reload after bulk delete
	const currentParams = {
		page: pagination.currentPage,
		pageSize: pagination.pageSize,
		sortBy: sortBy || undefined,
		sortOrder: sortOrder || undefined,
		search: search.searchQuery || undefined,
	};

	if (loading && !books.length) {
		return <LoadingState message="Loading books..." size="large" />;
	}

	return (
		<>
			<Page>
				<PageHeader
					title="Books"
					badge={totalCount}
					action={
						<>
							<SearchInput
								value={search.searchQuery}
								onChange={search.setSearchQuery}
								onClear={search.clearSearch}
								placeholder="Search by title or author..."
								loading={loading && !!search.searchQuery}
								aria-label="Search books by title or author"
								id="books-search"
								className={`
          w-full
          sm:w-64
        `}
							/>
							<ColumnVisibility
								columns={toColumnVisibilityDefs(BOOK_TABLE_COLUMNS)}
								visibleColumns={columnVisibility.visibleColumns}
								defaultVisible={new Set(extractDefaultVisible(BOOK_TABLE_COLUMNS))}
								onToggle={columnVisibility.toggleColumn}
								onReset={() => {
									columnVisibility.resetColumns();
									columnOrder.resetOrder();
								}}
								onShowAll={columnVisibility.showAll}
								onHideAll={columnVisibility.hideAll}
								// Phase 2: Hook functions for improved separation of concerns
								isColumnModified={columnVisibility.isColumnModified}
								onResetColumn={columnVisibility.resetColumn}
								// Column ordering (enables drag & drop)
								columnOrder={columnOrder.columnOrder}
								defaultOrder={extractColumnIds(BOOK_TABLE_COLUMNS)}
								onReorderColumns={columnOrder.reorderColumns}
								isColumnModifiedOrder={columnOrder.isColumnModified}
								onResetColumnOrder={columnOrder.resetColumn}
							/>
							<Button onClick={handleNewBook} data-testid="add-book-button">
								<Plus />
								Add Book
							</Button>
						</>
					}
				/>

				{/* Content */}
				{books.length === 0 && !loading ? (
					<EmptyState
						icon={<BookOpen className="size-16" />}
						title="No books yet"
						description="Start building your library by adding your first book."
						action={{
							label: 'Add First Book',
							onClick: handleNewBook,
						}}
					/>
				) : (
					<>
						{/* Bulk Action Bar */}
						{selectedIds.size > 0 && (
							<BulkActionBar
								selectionCount={selectedIds.size}
								selectedLabel={`${selectedIds.size} book(s) selected`}
								onCancel={() => setSelectedIds(new Set())}
								variant="light"
							>
								<Button onClick={handleBulkDelete} variant="destructive" size="sm">
									<Trash2 className="mr-2 size-4" />
									Delete
								</Button>
							</BulkActionBar>
						)}

						<BookTable
							storageId={storageId}
							books={books}
							onDelete={handleDelete}
							onEdit={handleEdit}
							pagination={
								paginationData
									? {
											currentPage: paginationData.page,
											totalPages: paginationData.totalPages,
											totalItems: paginationData.total,
											onPageChange: pagination.setPage,
											pageSize: pagination.pageSize,
											onPageSizeChange: pagination.setPageSize,
											pageSizeOptions: [5, 10, 20, 50],
										}
									: undefined
							}
							sorting={{
								sortConfigs: sorting.sortConfigs,
								onSortChange: sorting.handleSort,
							}}
							visibleColumns={columnVisibility.visibleColumns}
							columnOrder={columnOrder.columnOrder}
							refreshing={isRefreshing || bulkDelete.state.isRefreshingAfterMutation}
							deleting={bulkDelete.state.isBulkDeleting}
							selectable={true}
							selectedIds={selectedIds}
							onSelectionChange={setSelectedIds}
							deletingIds={bulkDelete.state.deletingIds}
						/>
					</>
				)}
			</Page>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={bulkDelete.state.showDialog}
				onOpenChange={bulkDelete.actions.setShowDialog}
				selectedIds={selectedIds}
				onClear={() => setSelectedIds(new Set())}
				onBulkDelete={bulkDeleteBooks}
				onReload={() => loadBooks(currentParams)}
				itemTypeName="book"
				onDeletingChange={bulkDelete.actions.setDeletingIds}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						bulkDelete.actions.startDeleting(new Set());
						bulkDelete.actions.markMutating();
					}
				}}
			/>

			{/* Create/Edit Dialog */}
			<BookDialog
				open={isOpen}
				onClose={() => navigate('/books')}
				book={editingBook}
				onSubmit={handleSubmit}
				onRefresh={handleRefresh}
				isRefreshing={isDialogRefreshing}
				onCheckISBN={checkISBN}
				onPatchISBN={handlePatchISBN}
			/>
		</>
	);
}
