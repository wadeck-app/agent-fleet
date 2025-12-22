import React from 'react';
import { Navigate } from 'react-router-dom';

import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';

import { useAuth } from '@app/hooks/useAuth';

/**
 * Protected Route Props
 */
export interface ProtectedRouteProps {
	/**
	 * Child components to render if authenticated
	 */
	children: React.ReactNode;

	/**
	 * Redirect path if not authenticated
	 * @default '/login'
	 */
	redirectTo?: string;
}

/**
 * Protected Route Component
 *
 * Wraps routes that require authentication. Checks authentication status
 * and redirects to login page if not authenticated.
 *
 * Features:
 * - Shows loading spinner while checking authentication
 * - Redirects to login if not authenticated
 * - Renders children if authenticated
 * - Customizable redirect path
 *
 * @example
 * ```tsx
 * // In your routes
 * <Route
 *   path="/dashboard"
 *   element={
 *     <ProtectedRoute>
 *       <DashboardPage />
 *     </ProtectedRoute>
 *   }
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Custom redirect path
 * <Route
 *   path="/admin"
 *   element={
 *     <ProtectedRoute redirectTo="/unauthorized">
 *       <AdminPage />
 *     </ProtectedRoute>
 *   }
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Wrap multiple routes
 * function ProtectedRoutes() {
 *   return (
 *     <ProtectedRoute>
 *       <Routes>
 *         <Route path="/dashboard" element={<DashboardPage />} />
 *         <Route path="/tasks" element={<TasksPage />} />
 *         <Route path="/workers" element={<WorkersPage />} />
 *       </Routes>
 *     </ProtectedRoute>
 *   );
 * }
 * ```
 */
export function ProtectedRoute({ children, redirectTo = '/login' }: ProtectedRouteProps) {
	const { state } = useAuth();

	/**
	 * Show loading spinner while checking authentication
	 */
	if (state.loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<LoadingSpinner size="lg" message="Verifying authentication..." />
			</div>
		);
	}

	/**
	 * Redirect to login if not authenticated
	 */
	if (!state.authenticated) {
		console.log('[ProtectedRoute] Not authenticated, redirecting to:', redirectTo);
		return <Navigate to={redirectTo} replace />;
	}

	/**
	 * Render children if authenticated
	 */
	return <>{children}</>;
}
