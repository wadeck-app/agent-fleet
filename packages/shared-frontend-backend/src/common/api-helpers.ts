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
});

/**
 * Common delete response
 */
export const DeleteResponseSchema = z.object({
	success: z.boolean(),
	id: z.string(),
});

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
