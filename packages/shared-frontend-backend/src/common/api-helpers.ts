import { z } from 'zod';

/**
 * ===========================================================================================
 * COMMON API HELPERS - Ultra-optimized reusable schemas with Input Sanitization
 * ===========================================================================================
 *
 * This file contains reusable Zod schemas that are common across multiple API contracts.
 * Following the ultra-optimization pattern from ingredients.contract.ultra-optimized.ts
 *
 * Benefits:
 * - Zero duplication
 * - Single source of truth
 * - Easy to maintain
 * - Comprehensive input sanitization
 *
 * ===========================================================================================
 */

/**
 * Common pagination and sorting query params (used in all list endpoints)
 * Search queries are sanitized to prevent SQL injection and XSS
 * Supports multi-column sorting via comma-separated values
 */
export const BaseListQuerySchema = z.object({
	search: z
		.string()
		.max(255, 'Search query must be at most 255 characters')
		.transform(val =>
			val
				.trim()
				// Remove null bytes
				.replace(/\0/g, '')
				// Remove potential SQL injection patterns
				.replace(/['";]/g, '')
				// Normalize whitespace
				.replace(/\s+/g, ' ')
		)
		.optional(),
	page: z.coerce.number().int().min(1).optional(),
	pageSize: z.coerce.number().int().min(1).max(100).optional(),
	// Multi-column sorting: comma-separated column names
	sortBy: z.string().max(200).optional(),
	// Multi-column sorting: comma-separated orders (asc/desc)
	sortOrder: z.string().max(50).optional(),
	// Cache busting parameter (incremented on manual refresh for HTTP cache and backend logging)
	cacheId: z.coerce.number().int().min(0).optional(),
});

/**
 * Type-safe query object inferred from BaseListQuerySchema
 * Represents the final validated query sent to the backend
 */
export type BaseListQuery = z.infer<typeof BaseListQuerySchema>;

/**
 * Mutable query object for the composition phase.
 * All properties are optional since features may not fill all fields.
 * This is what features receive in fillQuery() to mutate during composition.
 *
 * Example:
 * ```typescript
 * const fillQuery = useCallback((query: BaseListQueryMutable) => {
 *   query.page = currentPage;        // Only set if needed
 *   query.pageSize = pageSize;       // Only set if needed
 *   // No need to set search/sortBy/etc if not relevant for this feature
 * }, [currentPage, pageSize]);
 * ```
 */
export type BaseListQueryMutable = {
	search?: string | null;
	page?: number | null;
	pageSize?: number | null;
	sortBy?: string | null;
	sortOrder?: string | null;
	cacheId?: number | null;
	[key: string]: unknown; // Allow extra properties from feature-specific filters
};

/**
 * Common delete response
 */
export const DeleteResponseSchema = z.object({
	success: z.boolean(),
	id: z.string(),
});

/**
 * Common bulk delete schemas
 * Used for batch deletion operations across all entities
 */
export const BulkDeleteRequestSchema = z.object({
	ids: z.array(z.string()).min(1).max(10), // Max 10 per batch
});

export const FailedDeletionSchema = z.object({
	id: z.string(),
	reason: z.string(),
	code: z.string(),
});

export const BulkDeleteResponseSchema = z.object({
	success: z.literal(true),
	deleted: z.array(z.string()),
	failed: z.array(FailedDeletionSchema),
	totalRequested: z.number(),
	totalDeleted: z.number(),
	totalFailed: z.number(),
});

export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>;
export type BulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>;
export type FailedDeletion = z.infer<typeof FailedDeletionSchema>;

/**
 * Helper to create a list response schema
 */
export function createListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
	return z.object({
		items: z.array(itemSchema),
		pagination: z
			.object({
				total: z.number().int().min(0),
				page: z.number().int().min(1),
				pageSize: z.number().int().min(1),
				totalPages: z.number().int().min(0),
			})
			.optional(),
	});
}

/**
 * Helper to create entity-specific query schema by extending base query
 */
export function createQuerySchema<T extends z.ZodRawShape>(additionalFields: T) {
	return BaseListQuerySchema.extend(additionalFields);
}

export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;
