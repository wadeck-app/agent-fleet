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
 * - Ctrl+click on '/api/ingredients' shows GET and POST in one place
 * - All operations on the same resource are grouped together
 * - More RESTful and easier to navigate
 *
 * ===========================================================================================
 */
import { defineRoutes } from '../route-builder';
import { assertValidRoutes } from '../utils/validate-routes';
import { optionalSanitizedString, positiveNumber, sanitizedString } from '../validation/sanitization';

/**
 * ===========================================================================================
 * INGREDIENTS CONTRACT - Ultra-optimized with Input Sanitization
 * ===========================================================================================
 *
 * Following the ultra-optimization pattern:
 * - Define all fields once in IngredientFields
 * - Derive schemas using omit/partial/required
 * - Extract common parts to api-helpers
 * - Input sanitization on all string fields
 * - Comprehensive validation for all numeric fields
 *
 * ===========================================================================================
 */

/**
 * Ingredient-specific fields (nutritional data)
 * All string inputs are sanitized to prevent XSS and SQL injection
 * All numeric inputs are validated for positive values
 */
const IngredientFields = z.object({
	name: sanitizedString(1, 255),
	calories: positiveNumber(0, 'Calories must be positive'),
	protein: positiveNumber(0, 'Protein must be positive'),
	carbs: positiveNumber(0, 'Carbs must be positive'),
	fat: positiveNumber(0, 'Fat must be positive'),
	servingSize: positiveNumber(0.1, 'Serving size must be at least 0.1'),
	unit: optionalSanitizedString(50),
	category: optionalSanitizedString(100),
});

/**
 * Complete ingredient = specific fields + common metadata
 */
const BaseIngredient = IngredientFields.merge(BaseEntitySchema);

/**
 * Derived schemas (3 lines instead of ~30)
 */
export const IngredientSchema = BaseIngredient;
export const CreateIngredientSchema = BaseIngredient.omit({
	id: true,
	version: true,
	createdAt: true,
	updatedAt: true,
});
// @formatter:off
// PUT: Requires mandatory fields (name, calories, protein, carbs, fat, servingSize) + version
export const UpdateIngredientSchema = BaseIngredient.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});
// PATCH: All fields optional except version
export const PatchIngredientSchema = BaseIngredient.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.partial()
	.required({ version: true });
// @formatter:on

/**
 * List query with ingredient-specific filters (extends common base)
 */
const IngredientListQuerySchema = createQuerySchema({
	category: z.string().optional(),
});

/**
 * List response
 */
const IngredientListSchema = createListResponseSchema(IngredientSchema);

/**
 * Bulk delete schemas
 */
const BulkDeleteRequestSchema = z.object({
	ids: z.array(z.string()).min(1).max(10), // MAX 10 per batch
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

export const INGREDIENTS_API_ROUTES = defineRoutes({
	'/api/ingredients/': {
		GET: {
			query: IngredientListQuerySchema,
			response: IngredientListSchema,
		},
		POST: {
			body: CreateIngredientSchema,
			response: IngredientSchema,
		},
		DELETE: {
			body: BulkDeleteRequestSchema,
			response: BulkDeleteResponseSchema,
		},
	},
	'/api/ingredients/:id': {
		GET: {
			params: IdParamSchema,
			response: IngredientSchema,
		},
		PUT: {
			params: IdParamSchema,
			body: UpdateIngredientSchema,
			response: IngredientSchema,
		},
		PATCH: {
			params: IdParamSchema,
			body: PatchIngredientSchema,
			response: IngredientSchema,
		},
		DELETE: {
			params: IdParamSchema,
			response: DeleteResponseSchema,
		},
	},
});

// Validate routes at module load time (development/test only)
if (process.env.NODE_ENV !== 'production') {
	assertValidRoutes(INGREDIENTS_API_ROUTES, 'INGREDIENTS_API');
}

/**
 * Exported types
 */
export type Ingredient = z.infer<typeof IngredientSchema>;
export type CreateIngredient = z.infer<typeof CreateIngredientSchema>;
export type UpdateIngredient = z.infer<typeof UpdateIngredientSchema>;
export type PatchIngredient = z.infer<typeof PatchIngredientSchema>;
export type IngredientListResponse = z.infer<typeof IngredientListSchema>;
export type IngredientsListQuery = z.infer<typeof IngredientListQuerySchema>;
export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>;
export type BulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>;
export type FailedDeletion = z.infer<typeof FailedDeletionSchema>;
