import { createContext, useContext } from 'react';

/**
 * ===========================================================================================
 * DOMAIN CONTEXT - Generic Context Factory
 * ===========================================================================================
 *
 * Provides a type-safe factory for creating domain-specific contexts.
 * This is a pure TypeScript module (no React imports) that defines the shape
 * of domain contexts and provides utilities for creating them.
 *
 * Key Principles:
 * - Context owns ALL state (items, loading, error, pagination, query, selection)
 * - View components read from context (no data props, no service, no fetch logic)
 * - Actions are provided via context for CRUD operations
 * - Cross-widget communication is implicit through shared context
 *
 * Usage:
 * ```tsx
 * const { Context, useContext } = createDomainContext<Product, ProductQuery, ProductActions>('Product');
 * ```
 *
 * ===========================================================================================
 */

/**
 * Domain context value structure
 * Generic over:
 * - T: The entity type (e.g., Product, Ingredient)
 * - TQuery: The query parameters (search, filters, pagination, sorting)
 * - TActions: The available actions (create, update, delete, etc.)
 */
export interface DomainContextValue<T, TQuery, TActions> {
	/**
	 * Current items in the list
	 */
	items: T[];

	/**
	 * Loading state (initial load or refresh)
	 */
	loading: boolean;

	/**
	 * Error message (null if no error)
	 */
	error: string | null;

	/**
	 * Pagination metadata
	 */
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};

	/**
	 * Current query parameters
	 */
	query: TQuery;

	/**
	 * Currently selected item (for detail panel, edit mode, etc.)
	 */
	selectedItem: T | null;

	/**
	 * Available actions (create, update, delete, etc.)
	 */
	actions: TActions;
}

/**
 * Factory for creating domain-specific contexts
 * Returns a context and a hook that throws if used outside the provider
 */
export function createDomainContext<T, TQuery, TActions>(
	displayName: string
): {
	Context: React.Context<DomainContextValue<T, TQuery, TActions> | null>;
	useContext: () => DomainContextValue<T, TQuery, TActions>;
} {
	const Context = createContext<DomainContextValue<T, TQuery, TActions> | null>(null);
	Context.displayName = `${displayName}Context`;

	function useDomainContext(): DomainContextValue<T, TQuery, TActions> {
		const context = useContext(Context);
		if (!context) {
			throw new Error(`use${displayName}Context must be used within a ${displayName}Provider`);
		}
		return context;
	}

	return {
		Context,
		useContext: useDomainContext,
	};
}
