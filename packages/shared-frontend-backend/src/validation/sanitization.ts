import { z } from 'zod';

/**
 * ===========================================================================================
 * INPUT SANITIZATION UTILITIES
 * ===========================================================================================
 *
 * Comprehensive string sanitization for security and data quality.
 * Prevents XSS, SQL injection, and enforces data consistency.
 *
 * ===========================================================================================
 */

/**
 * Sanitize a string by trimming whitespace and removing null bytes
 * This is the base sanitization applied to all string inputs
 */
function sanitizeString(value: string): string {
	return (
		value
			.trim()
			// Remove null bytes (potential SQL injection vector)
			.replace(/\0/g, '')
			// Normalize whitespace (collapse multiple spaces)
			.replace(/\s+/g, ' ')
	);
}

/**
 * Remove HTML tags and entities from a string
 * Prevents stored XSS attacks
 */
function sanitizeHTML(value: string): string {
	return (
		value
			// Remove HTML tags
			.replace(/<[^>]*>/g, '')
			// Remove HTML entities
			.replace(/&[a-z]+;/gi, '')
	);
}

/**
 * Sanitize path-like strings to prevent directory traversal
 */
function sanitizePath(value: string): string {
	return (
		value
			// Remove path traversal attempts
			.replace(/\.\./g, '')
			.replace(/[/\\]/g, '')
	);
}

/**
 * ===========================================================================================
 * ZOD SCHEMA TRANSFORMERS
 * ===========================================================================================
 */

/**
 * Create a sanitized string schema (basic sanitization)
 * Use for: names, titles, categories
 */
export function sanitizedString(minLength = 1, maxLength = 255): z.ZodEffects<z.ZodString, string, string> {
	return z
		.string()
		.min(minLength, `Must be at least ${minLength} character${minLength > 1 ? 's' : ''}`)
		.max(maxLength, `Must be at most ${maxLength} characters`)
		.transform(sanitizeString);
}

/**
 * Create a sanitized text schema (HTML removed)
 * Use for: descriptions, comments, user-generated content
 */
export function sanitizedText(minLength = 1, maxLength = 5000): z.ZodEffects<z.ZodString, string, string> {
	return z
		.string()
		.min(minLength, `Must be at least ${minLength} character${minLength > 1 ? 's' : ''}`)
		.max(maxLength, `Must be at most ${maxLength} characters`)
		.transform(val => sanitizeHTML(sanitizeString(val)));
}

/**
 * Create an optional sanitized string schema
 */
export function optionalSanitizedString(maxLength = 255): z.ZodOptional<z.ZodEffects<z.ZodString, string, string>> {
	return z.string().max(maxLength, `Must be at most ${maxLength} characters`).transform(sanitizeString).optional();
}

/**
 * Create an ISBN schema with validation
 * ISBN-10: 10 digits with optional hyphens
 * ISBN-13: 13 digits with optional hyphens
 */
export function isbnSchema() {
	return z
		.string()
		.transform(val => sanitizeString(val).replace(/-/g, ''))
		.refine(val => /^\d{10}$/.test(val) || /^\d{13}$/.test(val), 'ISBN must be 10 or 13 digits (hyphens optional)');
}

/**
 * Create a positive number schema with minimum value
 */
export function positiveNumber(min = 0, errorMessage?: string): z.ZodNumber {
	return z.number().min(min, errorMessage || `Must be at least ${min}`);
}

/**
 * Create an optional positive number schema
 * Accepts undefined, 0, or positive numbers
 */
export function optionalPositiveNumber(min = 0): z.ZodOptional<z.ZodNumber> {
	return z.number().min(min, `Must be at least ${min}`).optional();
}

/**
 * ===========================================================================================
 * VALIDATION HELPERS
 * ===========================================================================================
 */

/**
 * Validate email format (basic check)
 */
export function emailSchema() {
	return z
		.string()
		.email('Invalid email format')
		.max(255, 'Email must be at most 255 characters')
		.transform(sanitizeString)
		.transform(val => val.toLowerCase());
}

/**
 * Validate URL format
 */
export function urlSchema(): z.ZodEffects<z.ZodString, string, string> {
	return z
		.string()
		.url('Invalid URL format')
		.max(2048, 'URL must be at most 2048 characters')
		.transform(sanitizeString);
}

/**
 * Validate year (1000-9999)
 */
export function yearSchema(): z.ZodUnion<[z.ZodNumber, z.ZodLiteral<0>]> {
	return z.union([z.number().int().min(1000).max(9999), z.literal(0)]);
}

/**
 * Type exports for use in other modules
 */
export type SanitizedString = z.infer<ReturnType<typeof sanitizedString>>;
export type SanitizedText = z.infer<ReturnType<typeof sanitizedText>>;
