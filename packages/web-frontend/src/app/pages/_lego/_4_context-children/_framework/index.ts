/**
 * ===========================================================================================
 * LEGO APPROACH 4 - COMPOUND COMPONENTS FRAMEWORK
 * ===========================================================================================
 *
 * Compound component pattern with context:
 * - Root component creates context with all state
 * - Child components consume context automatically
 * - Zero prop drilling, pure composition
 *
 * Pattern:
 * ```tsx
 * <DataTable service={productsService} columns={columns}>
 *   <DataTable.Toolbar>
 *     <DataTable.Search />
 *     <DataTable.CreateButton dialog={ProductDialog} />
 *   </DataTable.Toolbar>
 *   <DataTable.Body />
 *   <DataTable.Footer>
 *     <DataTable.Pagination />
 *   </DataTable.Footer>
 * </DataTable>
 * ```
 *
 * ===========================================================================================
 */

export { DataTable } from './DataTable';
export { DataTableContext, useDataTable } from './DataTableContext';
export type { DataTableContextValue } from './DataTableContext';
export { PageLayout } from './PageLayout';
export { useTableDataFetch } from './useTableDataFetch';
export type { PaginationData, QueryState, UseTableDataFetchParams, UseTableDataFetchResult } from './useTableDataFetch';
