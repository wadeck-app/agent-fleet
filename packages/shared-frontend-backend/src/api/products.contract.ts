import { z } from 'zod';

import { DeleteResponseSchema, createListResponseSchema, createQuerySchema } from '../common/api-helpers';
import { BaseEntitySchema, IdParamSchema } from '../common/base-entity';

/**
 * ===========================================================================================
 * API ROUTES CONTRACT
 * ===========================================================================================
 *
 * New structure: apiRoute > httpMethod > request/response types
 *
 * Benefits:
 * - Ctrl+click on '/api/products' shows GET and POST in one place
 * - All operations on the same resource are grouped together
 * - More RESTful and easier to navigate
 *
 * ===========================================================================================
 */
import { defineRoutes } from '../route-builder';
import { assertValidRoutes } from '../utils/validate-routes';
import { optionalSanitizedString, sanitizedString, sanitizedText, urlSchema } from '../validation/sanitization';

/**
 * ===========================================================================================
 * PRODUCTS CONTRACT - Ultra-optimized with Input Sanitization
 * ===========================================================================================
 *
 * Following the ultra-optimization pattern:
 * - Define all fields once in ProductFields
 * - Derive schemas using omit/partial/required
 * - Extract common parts to api-helpers
 * - Input sanitization on all string fields
 * - Comprehensive validation for enum fields and numeric constraints
 *
 * ===========================================================================================
 */

/**
 * Product category enum
 */
export const PRODUCT_CATEGORIES = [
	'electronics',
	'clothing',
	'food',
	'books',
	'sports',
	'home',
	'toys',
	'other',
] as const;

export const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES);

/**
 * Product status enum
 */
export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const;

export const ProductStatusSchema = z.enum(PRODUCT_STATUSES);

/**
 * Product-specific fields
 * All string inputs are sanitized to prevent XSS and SQL injection
 * Price must be >= 0
 * Stock must be >= 0 and integer
 * Rating must be 0-5
 */
const ProductFields = z.object({
	name: sanitizedString(1, 200),
	description: sanitizedText(1, 2000),
	category: ProductCategorySchema,
	price: z.number().min(0, 'Price must be >= 0'),
	stock: z.number().int().min(0, 'Stock must be >= 0'),
	status: ProductStatusSchema,
	rating: z.number().min(0, 'Rating must be >= 0').max(5, 'Rating must be <= 5'),
	imageUrl: urlSchema().optional(),
	featured: z.boolean(),
});

/**
 * Complete product = specific fields + common metadata
 */
const BaseProduct = ProductFields.merge(BaseEntitySchema);

/**
 * Derived schemas (3 lines instead of ~30)
 */
export const ProductSchema = BaseProduct;
export const CreateProductSchema = BaseProduct.omit({
	id: true,
	version: true,
	createdAt: true,
	updatedAt: true,
});
export const UpdateProductSchema = BaseProduct.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

/**
 * List query with product-specific filters (extends common base)
 */
const ProductListQuerySchema = createQuerySchema({
	category: ProductCategorySchema.optional(),
	status: ProductStatusSchema.optional(),
	featured: z
		.string()
		.transform(val => val === 'true')
		.optional(),
	minPrice: z
		.string()
		.transform(val => parseFloat(val))
		.optional(),
	maxPrice: z
		.string()
		.transform(val => parseFloat(val))
		.optional(),
});

/**
 * List response
 */
const ProductListSchema = createListResponseSchema(ProductSchema);

/**
 * Bulk delete schemas
 */
const BulkDeleteRequestSchema = z.object({
	ids: z.array(z.string()).min(1).max(10),
});

const FailedDeletionSchema = z.object({
	id: z.string(),
	reason: z.string(),
	code: z.string(),
});

const BulkDeleteResponseSchema = z.object({
	success: z.literal(true),
	deleted: z.array(z.string()),
	failed: z.array(FailedDeletionSchema),
	totalRequested: z.number(),
	totalDeleted: z.number(),
	totalFailed: z.number(),
});

export const PRODUCTS_API_ROUTES = defineRoutes({
	'/api/products/': {
		GET: {
			query: ProductListQuerySchema,
			response: ProductListSchema,
		},
		POST: {
			body: CreateProductSchema,
			response: ProductSchema,
		},
		DELETE: {
			body: BulkDeleteRequestSchema,
			response: BulkDeleteResponseSchema,
		},
	},
	'/api/products/:id': {
		GET: {
			params: IdParamSchema,
			response: ProductSchema,
		},
		PUT: {
			params: IdParamSchema,
			body: UpdateProductSchema,
			response: ProductSchema,
		},
		DELETE: {
			params: IdParamSchema,
			response: DeleteResponseSchema,
		},
	},
});

// Validate routes at module load time (development/test only)
if (process.env.NODE_ENV !== 'production') {
	assertValidRoutes(PRODUCTS_API_ROUTES, 'PRODUCTS_API');
}

/**
 * Exported types
 */
export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
export type ProductListResponse = z.infer<typeof ProductListSchema>;
export type ProductsListQuery = z.infer<typeof ProductListQuerySchema>;
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type ProductBulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>;
export type ProductBulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>;
export type ProductFailedDeletion = z.infer<typeof FailedDeletionSchema>;
