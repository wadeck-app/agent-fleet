/**
 * ===========================================================================================
 * BASE LIST QUERY - Backend Query Schema for List Operations
 * ===========================================================================================
 *
 * Defines the complete schema of possible query parameters that can be sent to the backend
 * for list/table operations. All feature hooks contribute properties to this query schema.
 *
 * Each property is optional - features only fill what they need.
 *
 * ===========================================================================================
 */

/**
 * Backend query schema for list operations.
 * Represents all possible query parameters that features can contribute.
 *
 * This type ensures:
 * - Type safety when accessing query properties
 * - Compile-time detection if property names change
 * - Clear documentation of all supported query parameters
 */
export interface BaseListQuery {
	/**
	 * Current page number (1-indexed).
	 * Filled by: pagination feature
	 */
	page?: number;

	/**
	 * Number of items per page.
	 * Filled by: pagination feature
	 */
	pageSize?: number;

	/**
	 * Comma-separated list of field names to sort by (e.g., 'name,createdAt').
	 * Filled by: sorting feature
	 */
	sortBy?: string;

	/**
	 * Comma-separated list of sort directions (e.g., 'asc,desc').
	 * Must have same number of values as sortBy.
	 * Filled by: sorting feature
	 */
	sortOrder?: string;

	/**
	 * Search query string.
	 * Filled by: search feature
	 */
	search?: string;

	/**
	 * Category filter value.
	 * Filled by: filter/category feature
	 */
	category?: string;

	/**
	 * Allow arbitrary additional properties for extensibility.
	 * Custom features can add their own query parameters beyond the standard set.
	 */
	[key: string]: unknown;
}
