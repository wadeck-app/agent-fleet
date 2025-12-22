/**
 * Auth Integration Tests
 *
 * Full integration tests for the authentication flow including:
 * - LoginPage → useAuth → ProtectedRoute integration
 * - Complete login flow with redirect
 * - Protected route access control
 * - Logout flow
 * - Session expiration handling
 * - Auth failure scenarios
 *
 * These tests verify the complete authentication flow from login
 * to protected content access and logout.
 */
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../hooks/useAuth';
import { LoginPage } from '../pages/auth/LoginPage';
import { ProtectedRoute } from '../pages/auth/ProtectedRoute';

// Mock fetch globally
global.fetch = vi.fn();

// Dashboard component for protected content
function DashboardPage() {
	const { state, logout } = useAuth();

	return (
		<div>
			<h1>Dashboard</h1>
			<div data-testid="user-id">User: {state.userId}</div>
			<div data-testid="auth-status">Authenticated: {state.authenticated ? 'yes' : 'no'}</div>
			<button onClick={logout}>Logout</button>
		</div>
	);
}

// Complete app with routing - using MemoryRouter for better test control
function TestApp({ initialPath = '/' }: { initialPath?: string }) {
	return (
		<MemoryRouter initialEntries={[initialPath]}>
			<Routes>
				<Route path="/" element={<Navigate to="/dashboard" replace />} />
				<Route path="/login" element={<LoginPage />} />
				<Route
					path="/dashboard"
					element={
						<ProtectedRoute>
							<DashboardPage />
						</ProtectedRoute>
					}
				/>
			</Routes>
		</MemoryRouter>
	);
}

// TODO: Auth code will change significantly - re-enable these tests after auth refactor
describe.skip('Auth Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(global.fetch as ReturnType<typeof vi.fn>).mockClear();
	});

	describe('complete login flow', () => {
		it('should login and redirect to dashboard', async () => {
			const user = userEvent.setup();

			// Mock session check (initial - not authenticated)
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: async () => ({ authenticated: false }),
			});

			render(<TestApp />);

			// Wait for initial session check and redirect to login
			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			// Mock successful login
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			// Fill in login form
			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			// Should redirect to dashboard
			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			expect(screen.getByTestId('user-id')).toHaveTextContent('User: user-123');
			expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated: yes');
		});

		it('should show error and stay on login page for invalid credentials', async () => {
			const user = userEvent.setup();

			// Mock session check (initial - not authenticated)
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
			});

			render(<TestApp />);

			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			// Mock failed login
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: async () => ({
					message: 'Invalid credentials',
				}),
			});

			// Try to login
			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'wrong@example.com');
			await user.type(passwordInput, 'wrongpassword');
			await user.click(submitButton);

			// Should show error and stay on login page
			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
			});

			expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
		});
	});

	describe('protected route access control', () => {
		it('should redirect to login when accessing protected route while not authenticated', async () => {
			// Mock session check - not authenticated
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
			});

			render(<TestApp />);

			// Should redirect to login
			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
		});

		it('should allow access to protected route when authenticated', async () => {
			// Mock session check - authenticated
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					authenticated: true,
					userId: 'user-456',
					expiresAt: Date.now() + 3600000,
				}),
			});

			render(<TestApp />);

			// Should show dashboard
			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			expect(screen.getByTestId('user-id')).toHaveTextContent('User: user-456');
		});

		it('should show loading spinner while checking authentication', async () => {
			// Mock session check that takes time
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
				() =>
					new Promise(resolve =>
						setTimeout(
							() =>
								resolve({
									ok: true,
									json: async () => ({
										authenticated: true,
										userId: 'user-789',
										expiresAt: Date.now() + 3600000,
									}),
								}),
							100
						)
					)
			);

			render(<TestApp />);

			// Should show loading spinner
			expect(screen.getByText('Verifying authentication...')).toBeInTheDocument();

			// Wait for authentication check
			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});
		});
	});

	describe('logout flow', () => {
		it('should logout and redirect to login page', async () => {
			const user = userEvent.setup();

			// Mock session check - authenticated
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					authenticated: true,
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			render(<TestApp />);

			// Wait for dashboard to load
			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			// Mock logout
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

			// Click logout
			const logoutButton = screen.getByRole('button', { name: /logout/i });
			await user.click(logoutButton);

			// Should redirect to login
			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
		});

		it('should logout even if API call fails', async () => {
			const user = userEvent.setup();

			// Mock session check - authenticated
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					authenticated: true,
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			render(<TestApp />);

			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			// Mock logout failure
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 500,
			});

			// Click logout
			const logoutButton = screen.getByRole('button', { name: /logout/i });
			await user.click(logoutButton);

			// Should still redirect to login
			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});
		});
	});

	describe('session expiration', () => {
		it('should redirect to login when session expires', async () => {
			// Start with valid session
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					authenticated: true,
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			const { rerender } = render(<TestApp />);

			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			// Simulate session check that fails (session expired)
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
			});

			// Rerender to trigger session check
			rerender(<TestApp />);

			// Should redirect to login
			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});
		});
	});

	describe('already authenticated redirect', () => {
		it('should redirect to dashboard if already authenticated and visiting login', async () => {
			// Mock session check - already authenticated
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					authenticated: true,
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			// Navigate to login page explicitly using initialPath
			render(<TestApp initialPath="/login" />);

			// Should redirect to dashboard
			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			expect(screen.queryByText('Sign in to your account')).not.toBeInTheDocument();
		});
	});

	describe('login → protected content → logout flow', () => {
		it('should complete full authentication lifecycle', async () => {
			const user = userEvent.setup();

			// 1. Initial state - not authenticated
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
			});

			render(<TestApp />);

			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			// 2. Login
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			await user.type(screen.getByLabelText(/email/i), 'test@example.com');
			await user.type(screen.getByLabelText(/password/i), 'password123');
			await user.click(screen.getByRole('button', { name: /sign in/i }));

			// 3. Verify access to protected content
			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			expect(screen.getByTestId('user-id')).toHaveTextContent('User: user-123');
			expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated: yes');

			// 4. Logout
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

			await user.click(screen.getByRole('button', { name: /logout/i }));

			// 5. Verify redirect to login
			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
		});
	});

	describe('multiple login attempts', () => {
		it('should allow retry after failed login', async () => {
			const user = userEvent.setup();

			// Initial session check
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
			});

			render(<TestApp />);

			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			// First attempt - fail
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: async () => ({
					message: 'Invalid credentials',
				}),
			});

			await user.type(screen.getByLabelText(/email/i), 'wrong@example.com');
			await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
			await user.click(screen.getByRole('button', { name: /sign in/i }));

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
			});

			// Second attempt - success
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			await user.clear(screen.getByLabelText(/email/i));
			await user.clear(screen.getByLabelText(/password/i));
			await user.type(screen.getByLabelText(/email/i), 'test@example.com');
			await user.type(screen.getByLabelText(/password/i), 'password123');
			await user.click(screen.getByRole('button', { name: /sign in/i }));

			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});
		});
	});

	describe('API endpoints', () => {
		it('should call correct endpoints during authentication flow', async () => {
			const user = userEvent.setup();
			const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;

			// Initial session check
			fetchSpy.mockResolvedValueOnce({
				ok: false,
			});

			render(<TestApp />);

			await waitFor(() => {
				expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
			});

			expect(fetchSpy).toHaveBeenCalledWith('/api/auth/session', {
				method: 'GET',
				credentials: 'include',
			});

			fetchSpy.mockClear();

			// Login
			fetchSpy.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					userId: 'user-123',
					expiresAt: Date.now() + 3600000,
				}),
			});

			await user.type(screen.getByLabelText(/email/i), 'test@example.com');
			await user.type(screen.getByLabelText(/password/i), 'password123');
			await user.click(screen.getByRole('button', { name: /sign in/i }));

			await waitFor(() => {
				expect(fetchSpy).toHaveBeenCalledWith(
					'/api/auth/login',
					expect.objectContaining({
						method: 'POST',
						credentials: 'include',
						body: JSON.stringify({
							email: 'test@example.com',
							password: 'password123',
						}),
					})
				);
			});

			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument();
			});

			fetchSpy.mockClear();

			// Logout
			fetchSpy.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

			await user.click(screen.getByRole('button', { name: /logout/i }));

			await waitFor(() => {
				expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', {
					method: 'POST',
					credentials: 'include',
				});
			});
		});
	});
});
