import type React from 'react';

import type { ColumnDef } from '../types/ColTypes';

/**
 * ===========================================================================================
 * COLUMN BUILDER - Fluent API for Column Definitions
 * ===========================================================================================
 *
 * Provides a type-safe, fluent API for building column definitions.
 * Each method returns a fully-typed ColumnDef<T> with sensible defaults.
 *
 * Usage:
 * ```tsx
 * const columns = [
 *   col.text<Product>('name', 'Product Name', { sortable: true, sticky: 'left' }),
 *   col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
 *   col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
 *   col.boolean<Product>('featured', 'Featured'),
 *   col.date<Product>('createdAt', 'Created', { sortable: true }),
 *   col.custom<Product>('actions', 'Actions', (item) => <ActionButtons item={item} />),
 * ];
 * ```
 *
 * ===========================================================================================
 */

interface BaseColumnOptions {
	sortable?: boolean;
	visible?: boolean;
	width?: string | number;
	sticky?: 'left' | 'right';
}

interface NumberColumnOptions extends BaseColumnOptions {
	prefix?: string;
	suffix?: string;
}

interface EnumColumnOptions extends BaseColumnOptions {
	badge?: boolean;
}

interface CustomColumnOptions {
	visible?: boolean;
	width?: string | number;
	sticky?: 'left' | 'right';
}

/**
 * Column builder object with type-safe methods
 */
export const col = {
	/**
	 * Create a text column definition
	 */
	text<T>(key: keyof T & string, label: string, opts?: BaseColumnOptions): ColumnDef<T> {
		return {
			key,
			label,
			type: 'text',
			visible: opts?.visible ?? true,
			sortable: opts?.sortable ?? false,
			width: opts?.width,
			sticky: opts?.sticky,
		};
	},

	/**
	 * Create a number column definition
	 * Supports prefix/suffix for currency, units, etc.
	 */
	number<T>(key: keyof T & string, label: string, opts?: NumberColumnOptions): ColumnDef<T> {
		return {
			key,
			label,
			type: 'number',
			visible: opts?.visible ?? true,
			sortable: opts?.sortable ?? false,
			prefix: opts?.prefix,
			suffix: opts?.suffix,
			width: opts?.width,
			sticky: opts?.sticky,
		};
	},

	/**
	 * Create an enum column definition
	 * Enum values used for filtering and validation
	 * Badge rendering optional
	 */
	enum<T>(
		key: keyof T & string,
		label: string,
		enumValues: readonly string[],
		opts?: EnumColumnOptions
	): ColumnDef<T> {
		return {
			key,
			label,
			type: 'enum',
			enumValues,
			badge: opts?.badge ?? false,
			visible: opts?.visible ?? true,
			sortable: opts?.sortable ?? false,
			width: opts?.width,
			sticky: opts?.sticky,
		};
	},

	/**
	 * Create a boolean column definition
	 * Typically rendered as checkmark or toggle
	 */
	boolean<T>(key: keyof T & string, label: string, opts?: BaseColumnOptions): ColumnDef<T> {
		return {
			key,
			label,
			type: 'boolean',
			visible: opts?.visible ?? true,
			sortable: opts?.sortable ?? false,
			width: opts?.width,
			sticky: opts?.sticky,
		};
	},

	/**
	 * Create a date column definition
	 * Formatted using default date formatter
	 */
	date<T>(key: keyof T & string, label: string, opts?: BaseColumnOptions): ColumnDef<T> {
		return {
			key,
			label,
			type: 'date',
			visible: opts?.visible ?? true,
			sortable: opts?.sortable ?? false,
			width: opts?.width,
			sticky: opts?.sticky,
		};
	},

	/**
	 * Create a custom column definition
	 * Requires a custom render function
	 * Not sortable by default
	 */
	custom<T>(
		key: keyof T & string,
		label: string,
		render: (item: T) => React.ReactNode,
		opts?: CustomColumnOptions
	): ColumnDef<T> {
		return {
			key,
			label,
			type: 'custom',
			render,
			visible: opts?.visible ?? true,
			sortable: false, // Custom columns are not sortable
			width: opts?.width,
			sticky: opts?.sticky,
		};
	},
};
