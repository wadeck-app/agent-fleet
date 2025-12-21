// Common - Base entity schemas and types
export { EntityMetadataSchema, BaseEntitySchema, IdParamSchema, PaginationSchema } from './common/base-entity';
export type { EntityMetadata, BaseEntity, IdParam, Pagination } from './common/base-entity';

// Common - API helpers
export {
	BaseListQuerySchema,
	DeleteResponseSchema,
	createListResponseSchema,
	createQuerySchema,
} from './common/api-helpers';
export type { DeleteResponse } from './common/api-helpers';

// Validation - Input sanitization
export {
	sanitizedString,
	sanitizedText,
	optionalSanitizedString,
	isbnSchema,
	positiveNumber,
	optionalPositiveNumber,
	emailSchema,
	urlSchema,
	yearSchema,
} from './validation/sanitization';
export type { SanitizedString, SanitizedText } from './validation/sanitization';

// Exceptions
export {
	HttpException,
	BadRequestException,
	UnauthorizedException,
	ForbiddenException,
	NotFoundException,
	ConflictException,
	UnprocessableEntityException,
	InternalServerErrorException,
	ERROR_CODES,
} from './exceptions/http-exceptions';
export type { ErrorResponse, ErrorCode } from './exceptions/http-exceptions';

// Route builder
export { defineRoutes } from './route-builder';
export type { HttpMethod, RouteContract, PathRoutes, ApiUrl, ApiRoutes } from './route-builder';

// API Contracts - Ingredients
export {
	IngredientSchema,
	CreateIngredientSchema,
	UpdateIngredientSchema,
	PatchIngredientSchema,
	INGREDIENTS_API_ROUTES,
} from './api/ingredients.contract';
export type {
	Ingredient,
	CreateIngredient,
	UpdateIngredient,
	PatchIngredient,
	IngredientListResponse,
	IngredientsListQuery,
} from './api/ingredients.contract';

// API Contracts - Books
export {
	BookSchema,
	CreateBookSchema,
	UpdateBookSchema,
	PatchBookSchema,
	BOOKS_API_ROUTES,
} from './api/books.contract';
export type {
	Book,
	CreateBook,
	UpdateBook,
	PatchBook,
	BookListResponse,
	BooksListQuery,
	IsbnParam,
	IsbnQuery,
	BulkDeleteRequest,
	BulkDeleteResponse,
	FailedDeletion,
} from './api/books.contract';

// Types - Combined routes and type helpers
export { ALL_API_ROUTES, ROUTES_BY_BASE_URL } from './types';
export type { PathsForMethod, RouteParams, RouteQuery, RouteBody, RouteResponse, ApiPath } from './types';

// Utils - Route validation
export { validateRoutes, assertValidRoutes, warnInvalidRoutes } from './utils/validate-routes';
export type { ValidationError, ValidationResult } from './utils/validate-routes';
