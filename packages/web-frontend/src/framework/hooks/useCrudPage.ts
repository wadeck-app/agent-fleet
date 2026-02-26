import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { usePagination } from '@framework/components/pagination/usePagination';
import type { TableColumn } from '@framework/components/table/Table';
import { useSorting } from '@framework/components/table/useSorting';
import { useTableRefreshing } from '@framework/components/table/useTableRefreshing';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import { useDebounce } from '@framework/hooks2/utility/useDebounce';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { useRoutedDialog } from '@framework/hooks/useRoutedDialog';
import {
	extractCanHideConstraints,
	extractColumnIds,
	extractDefaultVisible,
} from '@framework/utils/table/ColumnConfig';

/**
 * Configuration for useCrudPage hook
 */
export interface CrudPageConfig<TItem extends { id: string; version: number }> {
	/**
	 * Storage identifier for persisting table state (pagination, sorting, columns)
	 */
	storageId: string;

	/**
	 * Entity name (singular) for toast messages and display
	 * @example "book", "ingredient", "project"
	 */
	entityName: string;

	/**
	 * Base route path for navigation
	 * @example "/books", "/ingredients"
	 */
	basePath: string;

	/**
	 * Table column definitions
	 */
	columns: TableColumn<TItem>[];

	/**
	 * Hook that provides CRUD operations and data fetching
	 */
	useDataHook: (params: { page: number; pageSize: number; sortBy?: string; sortOrder?: string; search?: string }) => {
		items: TItem[];
		loading: boolean;
		error: Error | null;
		pagination: {
			page: number;
			totalPages: number;
			total: number;
		} | null;
		createItem: (data: any) => Promise<TItem>;
		updateItem: (id: string, data: any) => Promise<TItem>;
		deleteItem: (id: string) => Promise<void>;
		bulkDeleteItems: (ids: string[]) => Promise<any>;
		refreshItem: (id: string) => Promise<any>;
		clearError: () => void;
		totalCount: number;
		loadItems: (params: any) => Promise<void>;
	};

	/**
	 * Optional: initial page size
	 * @default 10
	 */
	defaultPageSize?: number;

	/**
	 * Optional: enable search functionality
	 * @default false
	 */
	enableSearch?: boolean;

	/**
	 * Optional: search hook for managing search state
	 */
	useSearchHook?: (config: { onSearchChange: () => void }) => {
		searchQuery: string;
		setSearchQuery: (query: string) => void;
		clearSearch: () => void;
	};
}

/**
 * Return type for useCrudPage hook
 */
export interface CrudPageState<TItem extends { id: string; version: number }> {
	// Data & loading
	items: TItem[];
	loading: boolean;
	error: string | null;
	totalCount: number;
	isRefreshing: boolean;

	// Pagination
	pagination: {
		currentPage: number;
		pageSize: number;
		setPage: (page: number) => void;
		setPageSize: (size: number) => void;
		paginationData: {
			page: number;
			totalPages: number;
			total: number;
		} | null;
	};

	// Sorting
	sorting: {
		// Core state
		sortConfigs: Array<{ key: string; direction: 'asc' | 'desc' }>;
		sortBy: string;
		sortOrder: string;

		// Spreadable props for components
		onSortChange: (key: string, shiftKey: boolean) => void;
	};

	// Column management
	columns: {
		visibleColumns: Set<string>;
		columnOrder: string[];
		columnVisibility: ReturnType<typeof useColumnVisibility>;
		columnOrderState: ReturnType<typeof useColumnOrder>;
		columnIds: string[];
		defaultVisible: string[];
		constraints: Record<string, { canHide: boolean }>;
	};

	// Search (optional)
	search?: {
		searchQuery: string;
		debouncedSearchQuery: string;
		setSearchQuery: (query: string) => void;
		clearSearch: () => void;
	};

	// Selection & bulk actions
	selection: {
		// Core state
		selectedIds: Set<string>;
		setSelectedIds: (ids: Set<string>) => void;
		clearSelection: () => void;
		deletingIds: Set<string>;
		isBulkDeleting: boolean;
		showBulkDeleteDialog: boolean;
		setShowBulkDeleteDialog: (show: boolean) => void;

		// Spreadable props for components (aliases)
		selectable: boolean;
		onSelectionChange: (ids: Set<string>) => void;
		deleting: boolean;
	};

	// Delete confirmation
	deleteConfirmation: {
		isOpen: boolean;
		itemId: string | null;
		openDialog: (id: string) => void;
		closeDialog: () => void;
		confirm: () => Promise<void>;
	};

	// Dialog routing
	dialog: {
		isOpen: boolean;
		editingItem: TItem | undefined;
		isDialogRefreshing: boolean;
	};

	// CRUD handlers
	handlers: {
		handleCreate: () => void;
		handleEdit: (item: TItem) => void;
		handleDelete: (id: string) => Promise<void>;
		handleBulkDelete: () => void;
		handleSubmit: (data: any) => Promise<void>;
		handleRefresh: () => Promise<void>;
		handleCloseDialog: () => void;
	};

	// Data operations
	operations: {
		createItem: (data: any) => Promise<TItem>;
		updateItem: (id: string, data: any) => Promise<TItem>;
		deleteItem: (id: string) => Promise<void>;
		bulkDeleteItems: (ids: string[]) => Promise<void>;
		loadItems: (params: any) => Promise<void>;
	};

	// Utility
	config: {
		storageId: string;
		entityName: string;
		basePath: string;
	};

	// Current query params for reload
	currentParams: {
		page: number;
		pageSize: number;
		sortBy?: string;
		sortOrder?: string;
		search?: string;
	};

	// Cache control (for debug display and manual refresh)
	cache: {
		cacheId: number;
		isRefreshing: boolean;
		refresh: () => void;
	};
}

/**
 * Generic CRUD page hook that eliminates boilerplate
 *
 * This hook consolidates all common CRUD page logic:
 * - Pagination, sorting, column management
 * - Selection and bulk operations
 * - Dialog routing
 * - Error handling and toasts
 * - Loading states
 *
 * @example
 * ```tsx
 * const crudState = useCrudPage({
 *   storageId: 'ingredients-table',
 *   entityName: 'ingredient',
 *   basePath: '/ingredients',
 *   columns: INGREDIENT_TABLE_COLUMNS,
 *   useDataHook: useIngredients,
 *   enableSearch: false,
 * });
 *
 * return (
 *   <Page>
 *     <PageHeader title="Ingredients" badge={crudState.totalCount} />
 *     <IngredientTable
 *       ingredients={crudState.items}
 *       onEdit={crudState.handlers.handleEdit}
 *       onDelete={crudState.handlers.handleDelete}
 *       {...crudState.pagination}
 *       {...crudState.sorting}
 *       {...crudState.columns}
 *       {...crudState.selection}
 *     />
 *   </Page>
 * );
 * ```
 */
export function useCrudPage<TItem extends { id: string; version: number }>(
	config: CrudPageConfig<TItem>
): CrudPageState<TItem> {
	const { id, mode } = useParams<{ id?: string; mode?: string }>();
	const navigate = useNavigate();

	// Destructure config
	const {
		storageId,
		entityName,
		basePath,
		columns,
		useDataHook,
		defaultPageSize = 10,
		enableSearch = false,
		useSearchHook,
	} = config;

	// Column metadata
	const columnIds = extractColumnIds(columns);
	const defaultVisible = extractDefaultVisible(columns);
	const constraints = extractCanHideConstraints(columns);

	// Pagination
	const paginationState = usePagination({ pageSize: defaultPageSize, storageId: entityName });

	// Sorting
	const sortingState = useSorting({ storageId });
	const sortBy = sortingState.sortConfigs.map(c => c.key).join(',');
	const sortOrder = sortingState.sortConfigs.map(c => c.direction).join(',');

	// Search
	const searchState = useSearchHook?.({ onSearchChange: () => paginationState.setPage(1) });

	// Add comment above the target line, not at the end
	// Debounced search query for display purposes (e.g., ActiveFeaturesPanel)
	const debouncedSearchQuery = useDebounce(searchState?.searchQuery || '', 300);

	// Column visibility
	const columnVisibilityState = useColumnVisibility(columnIds, {
		storageId,
		defaultVisible,
		constraints,
	});

	// Column ordering
	const columnOrderState = useColumnOrder({
		storageId,
		defaultOrder: columnIds,
	});

	// Selection & bulk delete
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [isBulkDeleting, _setIsBulkDeleting] = useState(false);
	const [isDialogRefreshing, setIsDialogRefreshing] = useState(false);

	// Delete confirmation state
	const [deleteConfirmationState, setDeleteConfirmationState] = useState<{
		open: boolean;
		itemId: string | null;
	}>({
		open: false,
		itemId: null,
	});

	// Build query params
	const queryParams = {
		page: paginationState.currentPage,
		pageSize: paginationState.pageSize,
		sortBy: sortBy || undefined,
		sortOrder: sortOrder || undefined,
		search: enableSearch ? searchState?.searchQuery || undefined : undefined,
	};

	// Data fetching
	const {
		items,
		loading,
		error,
		pagination: paginationData,
		createItem,
		updateItem,
		deleteItem,
		bulkDeleteItems,
		refreshItem,
		clearError,
		totalCount,
		loadItems,
	} = useDataHook(queryParams);

	// Add comment above the target line, not at the end
	// Cache control for manual refresh and HTTP cache busting
	const cache = useCacheControl2({ enabled: true });

	// Add comment above the target line, not at the end
	// Wrap loadItems to increment cacheId and pass it to backend
	const loadItemsWithCache = useCallback(
		async (params: any) => {
			// Increment cacheId first
			cache.actions.refresh();
			// Pass cacheId to backend for cache busting and logging
			await loadItems({ ...params, cacheId: cache.fstate.cacheId + 1 });
		},
		[loadItems, cache.actions, cache.fstate.cacheId]
	);

	// Refreshing state for blur effect - includes cacheId to detect manual refresh
	const isRefreshing = useTableRefreshing({ ...queryParams, cacheId: cache.fstate.cacheId }, loading);

	// Add comment above the target line, not at the end
	// Convert Error object to string for useErrorToast
	const errorMessage = error?.message ?? null;

	// Error toast
	useErrorToast({ error: errorMessage, clearError });

	// Success toast
	const successToast = useCrudSuccessToast(entityName);

	// Dialog routing
	const { isOpen, editingItem } = useRoutedDialog<TItem>({
		mode: mode as 'new' | 'edit' | undefined,
		id,
		items,
		findItem: (items, id) => items.find(item => item.id === id),
		onNavigateBack: () => navigate(basePath),
	});

	// Handlers
	const handleCreate = () => {
		navigate(`${basePath}/new`);
	};

	const handleEdit = (item: TItem) => {
		navigate(`${basePath}/${item.id}/edit`);
	};

	// Add comment above the target line, not at the end
	// Internal delete handler - performs actual deletion with visual feedback
	const executeDelete = async (id: string) => {
		// Add comment above the target line, not at the end
		// Mark item as deleting for visual feedback
		setDeletingIds(prev => new Set([...prev, id]));
		try {
			await deleteItem(id);
			successToast.deleted();
		} finally {
			// Add comment above the target line, not at the end
			// Clear deleting state after deletion completes
			setDeletingIds(prev => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	};

	// Add comment above the target line, not at the end
	// Kept for backward compatibility - opens delete confirmation dialog
	const handleDelete = async (id: string) => {
		setDeleteConfirmationState({
			open: true,
			itemId: id,
		});
	};

	// Add comment above the target line, not at the end
	// Delete confirmation handlers
	const openDeleteDialog = (id: string) => {
		setDeleteConfirmationState({
			open: true,
			itemId: id,
		});
	};

	const closeDeleteDialog = () => {
		setDeleteConfirmationState({
			open: false,
			itemId: null,
		});
	};

	const confirmDelete = async () => {
		if (deleteConfirmationState.itemId) {
			await executeDelete(deleteConfirmationState.itemId);
			closeDeleteDialog();
		}
	};

	const handleBulkDelete = () => {
		if (selectedIds.size === 0) return;
		setShowBulkDeleteDialog(true);
	};

	const handleSubmit = async (data: any) => {
		const isEditing = !!editingItem;
		if (editingItem) {
			// Add comment above the target line, not at the end
			// Find the latest version from the items array
			const latestItem = items.find(item => item.id === editingItem.id);
			const version = latestItem?.version ?? editingItem.version;
			await updateItem(editingItem.id, { ...data, version });
		} else {
			await createItem(data);
		}
		navigate(basePath);

		// Show success toast
		if (isEditing) {
			successToast.updated();
		} else {
			successToast.created();
		}
	};

	const handleRefresh = async () => {
		if (editingItem) {
			setIsDialogRefreshing(true);
			try {
				await refreshItem(editingItem.id);
			} finally {
				setIsDialogRefreshing(false);
			}
		}
	};

	const handleCloseDialog = () => {
		navigate(basePath);
	};

	const clearSelection = () => {
		setSelectedIds(new Set());
	};

	return {
		// Data & loading
		items,
		loading,
		error: error?.message ?? null,
		totalCount,
		isRefreshing,

		// Pagination
		pagination: {
			currentPage: paginationState.currentPage,
			pageSize: paginationState.pageSize,
			setPage: paginationState.setPage,
			setPageSize: paginationState.setPageSize,
			paginationData,
		},

		// Sorting
		sorting: {
			sortConfigs: sortingState.sortConfigs,
			sortBy,
			sortOrder,
			onSortChange: sortingState.handleSort,
		},

		// Column management
		columns: {
			visibleColumns: columnVisibilityState.visibleColumns,
			columnOrder: columnOrderState.columnOrder,
			columnVisibility: columnVisibilityState,
			columnOrderState: columnOrderState,
			columnIds,
			defaultVisible,
			constraints,
		},

		// Search
		search:
			enableSearch && searchState
				? {
						...searchState,
						debouncedSearchQuery,
					}
				: undefined,

		// Selection & bulk actions
		selection: {
			selectedIds,
			setSelectedIds,
			clearSelection,
			deletingIds,
			isBulkDeleting,
			showBulkDeleteDialog,
			setShowBulkDeleteDialog,
			// Spreadable aliases for components
			selectable: true,
			onSelectionChange: setSelectedIds,
			deleting: isBulkDeleting,
		},

		// Delete confirmation
		deleteConfirmation: {
			isOpen: deleteConfirmationState.open,
			itemId: deleteConfirmationState.itemId,
			openDialog: openDeleteDialog,
			closeDialog: closeDeleteDialog,
			confirm: confirmDelete,
		},

		// Dialog routing
		dialog: {
			isOpen,
			editingItem: editingItem ?? undefined,
			isDialogRefreshing,
		},

		// Handlers
		handlers: {
			handleCreate,
			handleEdit,
			handleDelete,
			handleBulkDelete,
			handleSubmit,
			handleRefresh,
			handleCloseDialog,
		},

		// Operations
		operations: {
			createItem,
			updateItem,
			deleteItem,
			bulkDeleteItems,
			loadItems: loadItemsWithCache,
		},

		// Config
		config: {
			storageId,
			entityName,
			basePath,
		},

		// Current params
		currentParams: queryParams,

		// Cache control (for debug display and manual refresh)
		cache: {
			cacheId: cache.fstate.cacheId,
			isRefreshing: cache.fstate.isRefreshing,
			refresh: cache.actions.refresh,
		},
	};
}
