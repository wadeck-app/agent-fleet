import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Button } from '@framework/components/primitives/Button';
import { TextField } from '@framework/features/forms/fields/TextField';

import { useAuth } from '@app/hooks/useAuth';

/**
 * Login Page Component
 *
 * Provides login form with email and password fields.
 *
 * Features:
 * - Email and password input fields
 * - Form validation
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
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	/**
	 * Clear error when inputs change
	 */
	useEffect(() => {
		if (error) {
			setError(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [email, password]);

	/**
	 * Handle form submission
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Validation
		if (!email.trim()) {
			setError('Email is required');
			return;
		}

		if (!password) {
			setError('Password is required');
			return;
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			setError('Please enter a valid email address');
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await login(email, password);
			// Navigate is handled by useAuth hook
		} catch (err) {
			console.error('Login error:', err);
			setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
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
					<form onSubmit={handleSubmit} className="space-y-6">
						{/* Email Field */}
						<TextField
							label="Email"
							type="email"
							value={email}
							onChange={setEmail}
							placeholder="you@example.com"
							required
							disabled={isSubmitting}
							error={error && !password ? error : undefined}
						/>

						{/* Password Field */}
						<TextField
							label="Password"
							type="password"
							value={password}
							onChange={setPassword}
							placeholder="Enter your password"
							required
							disabled={isSubmitting}
							error={error && password ? error : undefined}
						/>

						{/* Error Message */}
						{error && (
							<div
								className={`
          rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3
          text-sm text-destructive
        `}
								role="alert"
							>
								{error}
							</div>
						)}

						{/* Submit Button */}
						<Button
							type="submit"
							variant="default"
							size="default"
							disabled={isSubmitting}
							className="w-full"
						>
							{isSubmitting ? (
								<>
									<LoadingSpinner size="sm" />
									<span className="ml-2">Signing in...</span>
								</>
							) : (
								'Sign in'
							)}
						</Button>
					</form>

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
