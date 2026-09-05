import type { ReactNode } from 'react';

import type { ColumnDef } from '@framework/lego/types/ColTypes';

import { PipelineProvider } from './PipelineContext';
import type { QueryModifier } from './PipelineTypes';
import type { PipelineService } from './usePipeline';

/**
 * ===========================================================================================
 * PIPELINE DATA TABLE
 * ===========================================================================================
 *
 * Main component for the query-modifier pipeline approach.
 *
 * Props:
 * - service: Service with getProducts method
 * - columns: Column definitions
 * - modifiers: Array of QueryModifier functions
 * - children: Sub-components (PipelineBody, PipelineSearch, etc.)
 *
 * Pattern:
 * - Creates PipelineProvider with modifiers
 * - Children access context via usePipelineContext
 * - Modifiers are applied sequentially to build query
 * - Data is fetched automatically when modifiers change
 *
 * Usage:
 * ```tsx
 * <PipelineDataTable
 *   service={productsService}
 *   columns={columns}
 *   modifiers={[withPagination(1, 10), withSearch('laptop')]}
 * >
 *   <PipelineToolbar>
 *     <PipelineSearch />
 *   </PipelineToolbar>
 *   <PipelineBody />
 *   <PipelinePagination />
 * </PipelineDataTable>
 * ```
 *
 * ===========================================================================================
 */

export interface PipelineDataTableProps<T> {
	service: PipelineService;
	columns: ColumnDef<T>[];
	modifiers: QueryModifier[];
	children: ReactNode;
}

export function PipelineDataTable<T>({ service, columns, modifiers, children }: PipelineDataTableProps<T>) {
	return (
		<PipelineProvider service={service} columns={columns} modifiers={modifiers}>
			{children}
		</PipelineProvider>
	);
}
