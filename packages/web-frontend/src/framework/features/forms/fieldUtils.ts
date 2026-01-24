/**
 * ===========================================================================================
 * FIELD UTILITIES - Shared utilities for form fields
 * ===========================================================================================
 *
 * Common utilities and constants used across form field components.
 *
 * ===========================================================================================
 */

// Base input styling shared across all input types
export const BASE_INPUT_CLASSES =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Generates a unique, accessible ID for a form field based on its label.
 * Removes special characters and converts spaces to hyphens.
 *
 * @param label - The field label
 * @param customId - Optional custom ID to use instead
 * @returns A unique ID string
 */
export function generateFieldId(label: string, customId?: string): string {
	if (customId) return customId;
	return `field-${label
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, '-')}`;
}

// Common base props for all fields
export interface BaseFieldProps {
	label: string;
	required?: boolean;
	error?: string;
	className?: string;
	id?: string;
	description?: string;
}
