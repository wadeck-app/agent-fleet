import { z } from 'zod';

/**
 * ===========================================================================================
 * LOGIN VALIDATION SCHEMA
 * ===========================================================================================
 *
 * Zod schema for login form validation.
 * Eliminates manual validation logic in LoginPage component.
 *
 * **Validation Rules:**
 * - Email: Must be a valid email format
 * - Password: Minimum 6 characters
 *
 * ===========================================================================================
 */

export const loginSchema = z.object({
	email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
	password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
