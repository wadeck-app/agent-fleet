/**
 * ===========================================================================================
 * TEXT VALIDATION UTILITIES
 * ===========================================================================================
 *
 * Reusable validation functions for text inputs.
 * - Type-safe validation with consistent error messages
 * - Composable validators
 * - Zero dependencies
 *
 * ===========================================================================================
 */

export type Validator = (value: string) => string | null;

/**
 * Validates that a value is not empty (after trimming)
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error message (default: "Value")
 * @returns Error message if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validateNotEmpty('', 'Name');
 * // Returns: "Name cannot be empty"
 * ```
 */
export function validateNotEmpty(value: string, fieldName = 'Value'): string | null {
	return value.trim() === '' ? `${fieldName} cannot be empty` : null;
}

/**
 * Validates that a value meets minimum length requirement
 *
 * @param value - The value to validate
 * @param min - Minimum length required
 * @param fieldName - Name of the field for error message (default: "Value")
 * @returns Error message if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validateMinLength('ab', 3, 'Password');
 * // Returns: "Password must be at least 3 characters"
 * ```
 */
export function validateMinLength(value: string, min: number, fieldName = 'Value'): string | null {
	return value.length < min ? `${fieldName} must be at least ${min} characters` : null;
}

/**
 * Validates that a value does not exceed maximum length
 *
 * @param value - The value to validate
 * @param max - Maximum length allowed
 * @param fieldName - Name of the field for error message (default: "Value")
 * @returns Error message if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validateMaxLength('too long text', 5, 'Title');
 * // Returns: "Title must be 5 characters or less"
 * ```
 */
export function validateMaxLength(value: string, max: number, fieldName = 'Value'): string | null {
	return value.length > max ? `${fieldName} must be ${max} characters or less` : null;
}

/**
 * Validates that a value is within a length range
 *
 * @param value - The value to validate
 * @param min - Minimum length required
 * @param max - Maximum length allowed
 * @param fieldName - Name of the field for error message (default: "Value")
 * @returns Error message if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validateLengthRange('ab', 3, 10, 'Username');
 * // Returns: "Username must be between 3 and 10 characters"
 * ```
 */
export function validateLengthRange(value: string, min: number, max: number, fieldName = 'Value'): string | null {
	if (value.length < min) {
		return `${fieldName} must be at least ${min} characters`;
	}
	if (value.length > max) {
		return `${fieldName} must be ${max} characters or less`;
	}
	return null;
}

/**
 * Validates that a value matches a regular expression pattern
 *
 * @param value - The value to validate
 * @param pattern - Regular expression pattern to match
 * @param errorMessage - Custom error message
 * @returns Error message if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validatePattern('abc123', /^[a-z]+$/, 'Must contain only lowercase letters');
 * // Returns: "Must contain only lowercase letters"
 * ```
 */
export function validatePattern(value: string, pattern: RegExp, errorMessage: string): string | null {
	return !pattern.test(value) ? errorMessage : null;
}

/**
 * Combines multiple validators into a single validator function.
 * Validators are executed in order, and the first error encountered is returned.
 *
 * @param validators - Array of validator functions to combine
 * @returns Combined validator function
 *
 * @example
 * ```typescript
 * const validateUsername = createValidator(
 *   (v) => validateNotEmpty(v, 'Username'),
 *   (v) => validateLengthRange(v, 3, 20, 'Username'),
 *   (v) => validatePattern(v, /^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
 * );
 *
 * const error = validateUsername('ab');
 * // Returns: "Username must be at least 3 characters"
 * ```
 */
export function createValidator(...validators: Validator[]): Validator {
	return (value: string) => {
		for (const validator of validators) {
			const error = validator(value);
			if (error) return error;
		}
		return null;
	};
}

/**
 * Validates that a value has not changed from its original value
 *
 * @param value - The current value
 * @param originalValue - The original value to compare against
 * @returns Error message if changed, null if unchanged
 *
 * @example
 * ```typescript
 * const error = validateUnchanged('new', 'original');
 * // Returns: null (no error, just indicates no change needed)
 * ```
 */
export function isUnchanged(value: string, originalValue: string): boolean {
	return value.trim() === originalValue;
}
