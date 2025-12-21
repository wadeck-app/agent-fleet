import { z } from 'zod';

/**
 * Common entity metadata shared across all entities
 */
export const EntityMetadataSchema = z.object({
	version: z.number().int().positive(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

/**
 * Base entity schema with ID + metadata
 */
export const BaseEntitySchema = z
	.object({
		id: z.string(),
	})
	.merge(EntityMetadataSchema);

/**
 * Common ID parameter for routes
 */
export const IdParamSchema = z.object({ id: z.string() });

/**
 * Common pagination schema
 */
export const PaginationSchema = z.object({
	total: z.number().int().min(0),
	page: z.number().int().min(1),
	pageSize: z.number().int().min(1),
	totalPages: z.number().int().min(0),
});

/**
 * Type exports
 */
export type EntityMetadata = z.infer<typeof EntityMetadataSchema>;
export type BaseEntity = z.infer<typeof BaseEntitySchema>;
export type IdParam = z.infer<typeof IdParamSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
