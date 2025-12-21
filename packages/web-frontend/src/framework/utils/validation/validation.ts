/**
 * ===========================================================================================
 * CENTRALIZED VALIDATION LIBRARY
 * ===========================================================================================
 *
 * Reusable validation utilities for consistent validation across the application.
 * - Type-safe validation functions
 * - Composable validators
 * - Standardized error messages
 * - Support for custom validators
 *
 * ===========================================================================================
 */

/**
 * Validation result type
 */
export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validator function type
 */
export type Validator<T = unknown> = (value: T, fieldName?: string) => string | null;

/**
 * Schema validator for object validation
 */
export type ValidationSchema<T> = {
	[K in keyof T]?: Validator<T[K]> | Validator<T[K]>[];
};

/**
 * Create a validation result
 */
export function createValidationResult(errors: string[]): ValidationResult {
	return {
		valid: errors.length === 0,
		errors,
	};
}

// ===========================================================================================
// BASIC VALIDATORS
// ===========================================================================================

/**
 * Required field validator
 */
export function required(fieldName: string = 'Field'): Validator {
	return (value: unknown) => {
		if (value === null || value === undefined || value === '') {
			return `${fieldName} is required`;
		}
		if (typeof value === 'string' && value.trim().length === 0) {
			return `${fieldName} cannot be empty`;
		}
		return null;
	};
}

/**
 * Minimum length validator
 */
export function minLength(min: number, fieldName: string = 'Field'): Validator<string> {
	return (value: string) => {
		if (value && value.length < min) {
			return `${fieldName} must be at least ${min} characters`;
		}
		return null;
	};
}

/**
 * Maximum length validator
 */
export function maxLength(max: number, fieldName: string = 'Field'): Validator<string> {
	return (value: string) => {
		if (value && value.length > max) {
			return `${fieldName} must be less than ${max} characters`;
		}
		return null;
	};
}

/**
 * Minimum value validator
 */
export function minValue(min: number, fieldName: string = 'Value'): Validator<number> {
	return (value: number) => {
		if (value !== undefined && value < min) {
			return `${fieldName} must be at least ${min}`;
		}
		return null;
	};
}

/**
 * Maximum value validator
 */
export function maxValue(max: number, fieldName: string = 'Value'): Validator<number> {
	return (value: number) => {
		if (value !== undefined && value > max) {
			return `${fieldName} must be at most ${max}`;
		}
		return null;
	};
}

/**
 * Range validator (inclusive)
 */
export function range(min: number, max: number, fieldName: string = 'Value'): Validator<number> {
	return (value: number) => {
		if (value !== undefined && (value < min || value > max)) {
			return `${fieldName} must be between ${min} and ${max}`;
		}
		return null;
	};
}

/**
 * Positive number validator
 */
export function positive(fieldName: string = 'Value'): Validator<number> {
	return (value: number) => {
		if (value !== undefined && value < 0) {
			return `${fieldName} must be positive`;
		}
		return null;
	};
}

/**
 * Non-negative number validator
 */
export function nonNegative(fieldName: string = 'Value'): Validator<number> {
	return (value: number) => {
		if (value !== undefined && value < 0) {
			return `${fieldName} must be non-negative`;
		}
		return null;
	};
}

/**
 * Email validator
 */
export function email(fieldName: string = 'Email'): Validator<string> {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return (value: string) => {
		if (value && !emailRegex.test(value)) {
			return `${fieldName} must be a valid email address`;
		}
		return null;
	};
}

/**
 * URL validator
 */
export function url(fieldName: string = 'URL'): Validator<string> {
	return (value: string) => {
		if (value) {
			try {
				new URL(value);
			} catch {
				return `${fieldName} must be a valid URL`;
			}
		}
		return null;
	};
}

/**
 * Pattern validator (regex)
 */
export function pattern(regex: RegExp, message: string): Validator<string> {
	return (value: string) => {
		if (value && !regex.test(value)) {
			return message;
		}
		return null;
	};
}

/**
 * ISBN validator (basic check)
 */
export function isbn(fieldName: string = 'ISBN'): Validator<string> {
	// Basic ISBN format: xxx-x-xxxx-xxxx-x or xxxxxxxxxx
	const isbnRegex = /^(?:\d{3}-\d{1,5}-\d{1,7}-\d{1,7}-\d{1}|\d{10,13})$/;
	return (value: string) => {
		if (value && !isbnRegex.test(value)) {
			return `${fieldName} must be a valid ISBN format`;
		}
		return null;
	};
}

/**
 * Year validator (reasonable range)
 */
export function year(fieldName: string = 'Year'): Validator<number> {
	const currentYear = new Date().getFullYear();
	return (value: number) => {
		if (value !== undefined) {
			if (value < 0) {
				return `${fieldName} must be positive`;
			}
			if (value > currentYear + 10) {
				return `${fieldName} cannot be more than 10 years in the future`;
			}
		}
		return null;
	};
}

// ===========================================================================================
// COMBINATOR VALIDATORS
// ===========================================================================================

/**
 * Combine multiple validators (all must pass)
 */
export function combine<T>(...validators: Validator<T>[]): Validator<T> {
	return (value: T, fieldName?: string) => {
		for (const validator of validators) {
			const error = validator(value, fieldName);
			if (error) {
				return error; // Return first error
			}
		}
		return null;
	};
}

/**
 * Optional validator (only validates if value is present)
 */
export function optional<T>(validator: Validator<T>): Validator<T | undefined | null> {
	return (value: T | undefined | null, fieldName?: string) => {
		if (value === undefined || value === null || value === '') {
			return null; // Skip validation if empty
		}
		return validator(value as T, fieldName);
	};
}

/**
 * Conditional validator (only validates if condition is true)
 */
export function when<T>(condition: (value: T) => boolean, validator: Validator<T>): Validator<T> {
	return (value: T, fieldName?: string) => {
		if (condition(value)) {
			return validator(value, fieldName);
		}
		return null;
	};
}

// ===========================================================================================
// VALIDATION HELPERS
// ===========================================================================================

/**
 * Validate a single value with one or more validators
 */
export function validateValue<T>(value: T, validators: Validator<T> | Validator<T>[], fieldName?: string): string[] {
	const validatorList = Array.isArray(validators) ? validators : [validators];
	const errors: string[] = [];

	for (const validator of validatorList) {
		const error = validator(value, fieldName);
		if (error) {
			errors.push(error);
		}
	}

	return errors;
}

/**
 * Validate an object against a schema
 */
export function validateSchema<T extends Record<string, unknown>>(
	data: T,
	schema: ValidationSchema<T>
): ValidationResult {
	const errors: string[] = [];

	for (const key in schema) {
		const validators = schema[key];
		if (validators) {
			const fieldErrors = validateValue(data[key], validators as Validator | Validator[], key);
			errors.push(...fieldErrors);
		}
	}

	return createValidationResult(errors);
}

/**
 * Create a validator from a schema
 */
export function createValidator<T extends Record<string, unknown>>(
	schema: ValidationSchema<T>
): (data: T) => ValidationResult {
	return (data: T) => validateSchema(data, schema);
}

// ===========================================================================================
// COMMON VALIDATION SCHEMAS
// ===========================================================================================

/**
 * Common field validators
 */
export const commonValidators = {
	// Text fields
	requiredText: (fieldName: string) => combine(required(fieldName), minLength(1, fieldName)),
	shortText: (fieldName: string, max: number = 100) => combine(required(fieldName), maxLength(max, fieldName)),
	longText: (fieldName: string, max: number = 1000) => combine(required(fieldName), maxLength(max, fieldName)),

	// Number fields
	requiredPositive: (fieldName: string) => combine(required(fieldName), positive(fieldName)),
	optionalPositive: (fieldName: string) => optional(positive(fieldName)),
	requiredNonNegative: (fieldName: string) => combine(required(fieldName), nonNegative(fieldName)),
	optionalNonNegative: (fieldName: string) => optional(nonNegative(fieldName)),

	// Special formats
	requiredEmail: email('Email'),
	optionalEmail: optional(email('Email')),
	requiredUrl: url('URL'),
	optionalUrl: optional(url('URL')),
};
