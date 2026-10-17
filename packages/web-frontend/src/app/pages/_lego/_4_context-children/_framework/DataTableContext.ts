import { createContext, useContext } from 'react';

import type { ColumnDef } from '@framework/lego/types/ColTypes';

/**
 * ===========================================================================================
 * DATA TABLE CONTEXT - Compound Component State
 * ===========================================================================================
 *
 * Provides shared state for DataTable compound components.
 * Sub-components access this context automatically - zero explicit wiring.
 *
 * Pattern:
 * - Root DataTable creates context with all state
 * - Child components (Search, Body, Pagination) consume via useDataTable hook
 * - No prop drilling required
 *
 * Usage:
 * ```tsx
 * const ctx = useDataTable()
 * return <SearchInput value={ctx.search} onChange={ctx.setSearch} />
 * ```
 *
 * ===========================================================================================
 */

/** Query sent by DataTable to the service */
export interface DataTableQuery {
	search?: string;
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortOrder?: string;
}

/** Service contract consumed by DataTable (productsService and wrappers around it satisfy it) */
export interface DataTableService<T> {
	getProducts: (query: DataTableQuery) => Promise<{
		items: T[];
		total?: number;
		page?: number;
		pageSize?: number;
		pagination?: { total: number; page: number; pageSize: number; totalPages: number };
	}>;
	getProduct?: (id: string) => Promise<T>;
	// Method syntax on purpose (bivariant parameters): callers hold unvalidated form data (unknown), while productsService expects CreateProduct
	createProduct?(data: unknown): Promise<unknown>;
	updateProduct?(id: string, data: unknown): Promise<unknown>;
	deleteProduct?: (id: string) => Promise<void>;
	bulkDeleteProducts?: (ids: string[]) => Promise<unknown>;
}

export interface DataTableContextValue<T> {
	// Data
	items: T[];
	loading: boolean;
	pagination: { page: number; pageSize: number; total: number; totalPages: number };
	refresh: () => void;

	// Query state
	search: string;
	setSearch: (v: string) => void;
	page: number;
	pageSize: number;
	setPage: (p: number) => void;
	setPageSize: (s: number) => void;
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
	setSort: (key?: string, order?: 'asc' | 'desc') => void;

	// Selection
	selectedIds: Set<string>;
	setSelectedIds: (ids: Set<string>) => void;
	selectedItemId?: string;
	setSelectedItemId: (id?: string) => void;
	selectedItem: T | null;
	selectedItemLoading: boolean;

	// Column visibility
	visibleColumns: Set<string>;
	setVisibleColumns: (cols: Set<string>) => void;

	// CRUD
	editingItem: T | null;
	setEditingItem: (item: T | null) => void;
	dialogOpen: boolean;
	setDialogOpen: (open: boolean) => void;

	// Config
	service: DataTableService<T>;
	columns: ColumnDef<T>[];
	enableSorting: boolean;
	enableCrud: boolean;
}

// Create context with null default (must be used within DataTable)
export const DataTableContext = createContext<DataTableContextValue<unknown> | null>(null);

/**
 * Hook to access DataTable context
 * Throws if used outside DataTable provider
 */
export function useDataTable<T>(): DataTableContextValue<T> {
	const context = useContext(DataTableContext);
	if (!context) {
		throw new Error('useDataTable must be used within a DataTable component');
	}
	// The context is stored with an erased item type; each consumer picks T. Safe: the provider is the only writer.
	return context as DataTableContextValue<T>;
}
