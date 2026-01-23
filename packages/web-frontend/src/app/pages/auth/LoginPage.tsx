import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';

import { useAuth } from '@app/hooks/useAuth';

import { LoginForm } from './LoginForm';
import type { LoginFormData } from './loginSchema';

/**
 * Login Page Component
 *
 * Provides login form with email and password fields using React Hook Form.
 *
 * Features:
 * - Integrated form validation (React Hook Form + Zod)
 * - Loading state during login
 * - Error handling and display
 * - Redirect to home page on successful login
 * - Redirect to home page if already authenticated
 *
 * @example
 * ```tsx
 * <Route path="/login" element={<LoginPage />} />
 * ```
 */
export function LoginPage() {
	const { state, login } = useAuth();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	/**
	 * Handle form submission
	 */
	const handleSubmit = async (data: LoginFormData) => {
		setIsSubmitting(true);
		setError(null);

		try {
			await login(data.email, data.password);
			// Navigate is handled by useAuth hook
		} catch (err) {
			console.error('Login error:', err);
			setError(getErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * If still checking session, show loading
	 */
	if (state.loading && !isSubmitting) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<LoadingSpinner size="lg" message="Checking authentication..." />
			</div>
		);
	}

	/**
	 * If already authenticated, redirect to home
	 */
	if (state.authenticated) {
		return <Navigate to="/" replace />;
	}

	return (
		<div className={`flex min-h-screen items-center justify-center bg-background px-4`}>
			<div className="w-full max-w-md space-y-8">
				{/* Header */}
				<div className="text-center">
					<h1 className="text-3xl font-bold tracking-tight">Agent Fleet</h1>
					<p className="mt-2 text-sm text-muted-foreground">Sign in to your account</p>
				</div>

				{/* Login Form */}
				<div className="rounded-lg border border-border bg-card p-8 shadow-sm">
					<LoginForm onSubmit={handleSubmit} loading={isSubmitting} error={error} />

					{/* Demo credentials info (for development) */}
					{process.env.NODE_ENV === 'development' && (
						<div className={`mt-6 rounded-md bg-muted p-4 text-xs text-muted-foreground`}>
							<p className="font-semibold">Demo Credentials:</p>
							<p className="mt-1">Email: demo@example.com</p>
							<p>Password: demo123</p>
						</div>
					)}
				</div>

				{/* Footer */}
				<p className="text-center text-xs text-muted-foreground">Agent Fleet - Task Orchestration Platform</p>
			</div>
		</div>
	);
}
