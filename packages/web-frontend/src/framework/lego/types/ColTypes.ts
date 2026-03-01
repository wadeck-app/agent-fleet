import type React from 'react';

/**
 * ===========================================================================================
 * COLUMN DEFINITION TYPES - Foundation for Lego Framework
 * ===========================================================================================
 *
 * Base interface for defining table columns with type-safe metadata.
 * Used by col helpers to build strongly-typed column configurations.
 *
 * Features:
 * - Type-safe column keys
 * - Rich metadata for rendering (visibility, sorting, sticky)
 * - Specialized type hints for different column types (text, number, enum, etc.)
 * - Custom render support for complex cells
 *
 * ===========================================================================================
 */

/**
 * Base column definition interface
 * Generic over T to ensure type-safe key access
 */
export interface ColumnDef<T> {
	/**
	 * Column key - must be a key of T
	 */
	key: keyof T & string;

	/**
	 * Display label for the column header
	 */
	label: string;

	/**
	 * Whether the column is visible by default
	 * @default true
	 */
	visible?: boolean;

	/**
	 * Whether the column is sortable
	 * @default false
	 */
	sortable?: boolean;

	/**
	 * Custom render function for the cell
	 * Receives the entire item and returns React node
	 */
	render?: (item: T) => React.ReactNode;

	/**
	 * Column width (CSS value: '200px', '20%', etc.)
	 */
	width?: string | number;

	/**
	 * Sticky column positioning
	 */
	sticky?: 'left' | 'right';

	/**
	 * Type metadata used by col helpers
	 * Informs rendering behavior and default formatters
	 */
	type?: 'text' | 'number' | 'enum' | 'boolean' | 'date' | 'custom';

	/**
	 * Prefix for number columns (e.g., '$', '€')
	 */
	prefix?: string;

	/**
	 * Suffix for number columns (e.g., 'kg', 'USD')
	 */
	suffix?: string;

	/**
	 * Enum values for enum columns
	 * Used for filtering and validation
	 */
	enumValues?: readonly string[];

	/**
	 * Whether to render enum values as badges
	 * @default false
	 */
	badge?: boolean;
}
