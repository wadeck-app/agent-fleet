import type React from 'react';

/**
 * ===========================================================================================
 * FEATURE CONFIGURATION TYPES - Foundation for Lego Framework
 * ===========================================================================================
 *
 * Discriminated union types for feature configuration.
 * Supports both shorthand strings and detailed config objects.
 *
 * Pattern:
 * - Each feature has a config interface with type discriminator
 * - Feature unions allow string shortcuts OR config objects
 * - Helper functions resolve shortcuts to full config
 *
 * Usage:
 * ```tsx
 * // Shorthand
 * features: ['search', 'pagination', 'sorting']
 *
 * // Detailed config
 * features: [
 *   { type: 'search', placeholder: 'Search products...', debounce: 300 },
 *   { type: 'pagination', pageSizes: [10, 20, 50], defaultPageSize: 20 },
 *   { type: 'sorting', multi: true },
 * ]
 * ```
 *
 * ===========================================================================================
 */

/**
 * ===========================================================================================
 * CONFIG INTERFACES
 * ===========================================================================================
 */

/**
 * Search feature configuration
 */
export interface SearchConfig {
	type: 'search';
	placeholder?: string;
	debounce?: number;
}

/**
 * Pagination feature configuration
 */
export interface PaginationConfig {
	type: 'pagination';
	pageSizes?: number[];
	defaultPageSize?: number;
}

/**
 * Sorting feature configuration
 */
export interface SortingConfig {
	type: 'sorting';
	multi?: boolean;
}

/**
 * CRUD dialog props interface
 * Used by CrudConfig to specify the dialog component
 */
export interface CrudDialogProps {
	/**
	 * Item to edit (null = create mode)
	 */
	item: unknown | null;

	/**
	 * Save handler
	 */
	onSave: (data: unknown) => Promise<void>;

	/**
	 * Close handler
	 */
	onClose: () => void;
}

/**
 * CRUD feature configuration
 * Includes create/edit/delete operations
 */
export interface CrudConfig {
	type: 'crud';
	dialog: React.ComponentType<CrudDialogProps>;
}

/**
 * Bulk delete feature configuration
 */
export interface BulkDeleteConfig {
	type: 'bulk-delete';
	confirmMessage?: string;
}

/**
 * Autoplay feature configuration (Carousel)
 */
export interface AutoplayConfig {
	type: 'autoplay';
	interval?: number;
}

/**
 * Field visibility toggle configuration
 */
export interface FieldVisibilityConfig {
	type: 'field-visibility';
}

/**
 * Inline edit configuration
 */
export interface InlineEditConfig {
	type: 'inline-edit';
}

/**
 * Column visibility toggle configuration
 */
export interface ColumnVisibilityConfig {
	type: 'column-visibility';
}

/**
 * Column reordering configuration
 */
export interface ColumnReorderingConfig {
	type: 'column-reordering';
}

/**
 * ===========================================================================================
 * FEATURE UNION TYPES
 * ===========================================================================================
 */

/**
 * DataTable feature union
 * Supports string shortcuts or config objects
 */
export type DataTableFeature =
	| 'search'
	| SearchConfig
	| 'pagination'
	| PaginationConfig
	| 'sorting'
	| SortingConfig
	| 'column-visibility'
	| ColumnVisibilityConfig
	| 'column-reordering'
	| ColumnReorderingConfig
	| 'bulk-delete'
	| BulkDeleteConfig
	| CrudConfig;

/**
 * Carousel feature union
 */
export type CarouselFeature =
	| 'pagination'
	| PaginationConfig
	| AutoplayConfig
	| 'field-visibility'
	| FieldVisibilityConfig;

/**
 * ItemGrid feature union
 */
export type ItemGridFeature =
	| 'search'
	| SearchConfig
	| 'pagination'
	| PaginationConfig
	| CrudConfig
	| 'bulk-delete'
	| BulkDeleteConfig;

/**
 * DetailPanel feature union
 */
export type DetailPanelFeature = 'inline-edit' | InlineEditConfig;

/**
 * ===========================================================================================
 * HELPER FUNCTIONS
 * ===========================================================================================
 */

/**
 * Resolve a feature (string or config) to its config object
 * Returns null if the feature is a string that doesn't match the expected type
 *
 * @param feature - Feature string or config object
 * @param type - Expected config type
 * @returns Config object or null
 */
export function resolveFeature<T extends { type: string }>(feature: string | T, type: T['type']): T | null {
	// If feature is already a config object
	if (typeof feature === 'object' && feature.type === type) {
		return feature;
	}

	// If feature is a string matching the type, return default config
	if (feature === type) {
		return { type } as T;
	}

	// Otherwise, return null
	return null;
}
