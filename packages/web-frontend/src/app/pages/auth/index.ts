/**
 * Authentication Pages & Components
 *
 * This module provides authentication-related pages and components:
 * - LoginPage: Login form with email/password authentication
 * - ProtectedRoute: Route wrapper for authenticated-only pages
 *
 * Uses cookie-based authentication with HTTP_ONLY cookies for security.
 */

export { LoginPage } from './LoginPage';
export { ProtectedRoute } from './ProtectedRoute';
export type { ProtectedRouteProps } from './ProtectedRoute';
