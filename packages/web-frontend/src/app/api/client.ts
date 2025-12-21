/**
 * ===========================================================================================
 * ULTRA-TYPED API CLIENT WITH VALIDATION MODES
 * ===========================================================================================
 *
 * This module provides type-safe API clients for the application.
 *
 * Features:
 * - Automatic type inference from contracts
 * - Configurable validation modes (throw/warn/silent)
 * - Perfect autocomplete in IDE
 * - Compile-time errors for wrong types
 * - Runtime validation of requests and responses
 *
 * Benefits:
 * - Frontend knows EXACTLY what backend expects and returns
 * - Refactor backend contract → instant frontend errors
 * - Impossible to send wrong data
 * - Early bug detection with validation modes
 *
 * ===========================================================================================
 */

// Re-export base utilities
export {
	type ValidationMode,
	type TypedFetchOptions,
	ApiError,
	setValidationMode,
	getValidationMode,
} from '@framework/api/api-base';

// Re-export API clients
export { ingredientsApi } from '@app/pages/ingredients/ingredients.api';
export { booksApi } from '@app/pages/books/books.api';
