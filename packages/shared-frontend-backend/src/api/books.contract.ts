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
 * - Ctrl+click on '/api/books' shows GET and POST in one place
 * - All operations on the same resource are grouped together
 * - More RESTful and easier to navigate
 *
 * ===========================================================================================
 */
import { defineRoutes } from '../route-builder';
import { assertValidRoutes } from '../utils/validate-routes';
import { isbnSchema, optionalSanitizedString, sanitizedString, yearSchema } from '../validation/sanitization';

/**
 * ===========================================================================================
 * BOOKS CONTRACT - Ultra-optimized with Input Sanitization
 * ===========================================================================================
 *
 * Following the ultra-optimization pattern:
 * - Define all fields once in BookFields
 * - Derive schemas using omit/partial/required
 * - Extract common parts to api-helpers
 * - Input sanitization on all string fields
 * - Comprehensive validation for ISBN and numeric fields
 *
 * ===========================================================================================
 */

/**
 * Book-specific fields
 * All string inputs are sanitized to prevent XSS and SQL injection
 * ISBN format is validated (10 or 13 digits)
 * Year is validated (1000-9999 or 0)
 */
const BookFields = z.object({
	title: sanitizedString(1, 500),
	author: sanitizedString(1, 255),
	isbn: isbnSchema().optional(),
	// Allow 0 or valid year range - frontend sends 0 for empty fields
	publishedYear: yearSchema().optional(),
	genre: optionalSanitizedString(100),
	// Allow 0 or omit pages - frontend sends 0 for empty fields
	pages: z.union([z.number().int().min(1), z.literal(0)]).optional(),
});

/**
 * ISBN parameter schema for ISBN lookup endpoint
 * Validates ISBN format (10 or 13 digits with optional hyphens)
 */
const IsbnParamSchema = z.object({
	isbn: isbnSchema(),
});

/**
 * ISBN query schema with optional excludeBookId
 */
const IsbnQuerySchema = z.object({
	excludeBookId: z.string().optional(),
});

/**
 * Complete book = specific fields + common metadata
 */
const BaseBook = BookFields.merge(BaseEntitySchema);

/**
 * Derived schemas (3 lines instead of ~30)
 */
export const BookSchema = BaseBook;
export const CreateBookSchema = BaseBook.omit({
	id: true,
	version: true,
	createdAt: true,
	updatedAt: true,
});
// PUT: Requires mandatory fields (title, author) + version
export const UpdateBookSchema = BaseBook.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});
// PATCH: All fields optional except version
export const PatchBookSchema = BaseBook.omit({ id: true, createdAt: true, updatedAt: true })
	.partial()
	.required({ version: true });

/**
 * List query with book-specific filters (extends common base)
 */
const BookListQuerySchema = createQuerySchema({
	author: z.string().optional(),
	genre: z.string().optional(),
});

/**
 * List response
 */
const BookListSchema = createListResponseSchema(BookSchema);

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

export const BOOKS_API_ROUTES = defineRoutes({
	'/api/books/': {
		GET: {
			query: BookListQuerySchema,
			response: BookListSchema,
		},
		POST: {
			body: CreateBookSchema,
			response: BookSchema,
		},
		DELETE: {
			body: BulkDeleteRequestSchema,
			response: BulkDeleteResponseSchema,
		},
	},
	'/api/books/:id': {
		GET: {
			params: IdParamSchema,
			response: BookSchema,
		},
		PUT: {
			params: IdParamSchema,
			body: UpdateBookSchema,
			response: BookSchema,
		},
		PATCH: {
			params: IdParamSchema,
			body: PatchBookSchema,
			response: BookSchema,
		},
		DELETE: {
			params: IdParamSchema,
			response: DeleteResponseSchema,
		},
	},
	'/api/books/isbn/:isbn': {
		GET: {
			params: IsbnParamSchema,
			query: IsbnQuerySchema,
			response: BookSchema,
		},
	},
});

// Validate routes at module load time (development/test only)
if (process.env.NODE_ENV !== 'production') {
	assertValidRoutes(BOOKS_API_ROUTES, 'BOOKS_API');
}

/**
 * Exported types
 */
export type Book = z.infer<typeof BookSchema>;
export type CreateBook = z.infer<typeof CreateBookSchema>;
export type UpdateBook = z.infer<typeof UpdateBookSchema>;
export type PatchBook = z.infer<typeof PatchBookSchema>;
export type BookListResponse = z.infer<typeof BookListSchema>;
export type BooksListQuery = z.infer<typeof BookListQuerySchema>;
export type IsbnParam = z.infer<typeof IsbnParamSchema>;
export type IsbnQuery = z.infer<typeof IsbnQuerySchema>;
//FIXME name bulkDelete with Book !
export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>;
export type BulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>;
//FIXME name FailedDeletion with Book !
export type FailedDeletion = z.infer<typeof FailedDeletionSchema>;
