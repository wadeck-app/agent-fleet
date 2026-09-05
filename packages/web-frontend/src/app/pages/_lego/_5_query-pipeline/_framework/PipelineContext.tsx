import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import type { ColumnDef } from '@framework/lego/types/ColTypes';

import type { BaseQuery, QueryModifier } from './PipelineTypes';
import type { PipelineService } from './usePipeline';
import { usePipeline } from './usePipeline';

/**
 * ===========================================================================================
 * PIPELINE CONTEXT
 * ===========================================================================================
 *
 * Context for the query-modifier pipeline approach.
 * Provides data, loading state, and query to all sub-components.
 *
 * ===========================================================================================
 */

export interface PipelineContextValue<T> {
	items: T[];
	loading: boolean;
	error: string | null;
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
	query: BaseQuery;
	refresh: () => Promise<void>;
	setSearch: (value: string) => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	columns: ColumnDef<T>[];
	service: PipelineService;
}

const PipelineContext = createContext<PipelineContextValue<any> | null>(null);

export function usePipelineContext<T>(): PipelineContextValue<T> {
	const context = useContext(PipelineContext);
	if (!context) {
		throw new Error('usePipelineContext must be used within PipelineProvider');
	}
	return context as PipelineContextValue<T>;
}

export interface PipelineProviderProps<T> {
	service: PipelineService;
	columns: ColumnDef<T>[];
	modifiers: QueryModifier[];
	children: ReactNode;
}

export function PipelineProvider<T>({ service, columns, modifiers, children }: PipelineProviderProps<T>) {
	const pipelineState = usePipeline<T>(modifiers, service);

	const value: PipelineContextValue<T> = {
		...pipelineState,
		columns,
		service,
	};

	return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}
