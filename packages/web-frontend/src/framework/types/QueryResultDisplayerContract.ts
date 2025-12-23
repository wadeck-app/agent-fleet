/**
 * ===========================================================================================
 * QUERY RESULT DISPLAYER CONTRACT
 * ===========================================================================================
 *
 * Defines the contract for components that display query results (Table2, Grid2, etc.).
 * These components receive data and feature state injected by the Data2 shell.
 *
 * Purpose:
 * - Standardized props for all displayer components
 * - Type-safe communication between Data2 shell and UI components
 * - Feature state is optional (only present if feature is enabled)
 *
 * Supported Displayers:
 * - Table2 (data tables with sorting, pagination)
 * - Grid2 (card/grid layouts)
 * - Carousel2 (slideshows)
 * - List2 (simple lists)
 * - Custom components (via render prop)
 *
 * Example usage:
 * ```typescript
 * export function Table2<T>({
 *   data,
 *   isLoading,
 *   error,
 *   pagination,
 *   sorting,
 * }: QueryResultDisplayerProps<T>) {
 *   // Render table with data
 * }
 * ```
 *
 * ===========================================================================================
 */

/**
 * Sort configuration (matches backend format)
 */
export interface SortConfig {
	/** Field key to sort by */
	key: string;
	/** Sort direction */
	direction: 'asc' | 'desc';
}

/**
 * Contract for components that display query results.
 * These components are "dumb" - they receive data and callbacks via props.
 *
 * @template T - The type of data items being displayed
 */
export interface QueryResultDisplayerProps<T> {
	/**
	 * The data items to display.
	 * Empty array when loading initially or when no results.
	 */
	data: T[];

	/**
	 * Loading state.
	 * True when fetching data (initial or subsequent queries).
	 */
	isLoading: boolean;

	/**
	 * Error message if fetch failed.
	 * Null when no error.
	 */
	error: string | null;

	/**
	 * Pagination feature state (optional).
	 * Only present if pagination feature is enabled in Data2.
	 *
	 * Contains both state (currentPage, totalPages, etc.) and callbacks (onPageChange, etc.)
	 */
	pagination?: {
		/** Current page number (1-indexed) */
		currentPage: number;
		/** Total number of pages */
		totalPages: number;
		/** Total number of items across all pages */
		totalItems: number;
		/** Number of items per page */
		pageSize: number;
		/** Callback to change page */
		onPageChange: (page: number) => void;
		/** Callback to change page size */
		onPageSizeChange: (size: number) => void;
		/** Available page size options (typically [5, 10, 20, 50]) */
		pageSizeOptions?: number[];
	};

	/**
	 * Sorting feature state (optional).
	 * Only present if sorting feature is enabled in Data2.
	 *
	 * Supports multi-column sorting (shift+click to add secondary sorts).
	 */
	sorting?: {
		/** Current sort configurations (primary sort first) */
		sortConfigs: SortConfig[];
		/** Callback to change sort (shiftKey determines multi-sort behavior) */
		onSortChange: (key: string, shiftKey: boolean) => void;
	};

	/**
	 * Generic feature access (for custom features).
	 * Contains feature state objects indexed by feature name.
	 *
	 * Standard features (search, filter) are always present here.
	 * Custom features can add their own state.
	 *
	 * Example:
	 * ```typescript
	 * features: {
	 *   search: { query: 'chicken', isEmpty: false },
	 *   filter: { value: 'Protein', options: [...] }
	 * }
	 * ```
	 */
	features?: {
		search?: {
			query: string;
			isEmpty: boolean;
		};
		filter?: {
			value: string | null;
			options: string[];
		};
		[key: string]: unknown;
	};

	/**
	 * Refreshing state - true when refetching with existing data.
	 * Used to show visual feedback (blur effect) during data refresh.
	 * False during initial load or when no data exists yet.
	 */
	refreshing?: boolean;
}

/**
 * Type helper for extracting item type from QueryResultDisplayerProps
 */
export type QueryResultItem<T> = T extends QueryResultDisplayerProps<infer I> ? I : never;
