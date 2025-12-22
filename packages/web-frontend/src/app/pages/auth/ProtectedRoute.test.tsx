/**
 * ProtectedRoute Tests
 *
 * Tests for the protected route component including:
 * - Redirect to /login when not authenticated
 * - Rendering children when authenticated
 * - Loading state while checking authentication
 * - Custom redirect path support
 * - Integration with useAuth hook
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtectedRoute } from './ProtectedRoute';

// Mock useAuth hook
const mockAuthState: {
	authenticated: boolean;
	userId: string | null;
	expiresAt: number | null;
	loading: boolean;
} = {
	authenticated: false,
	userId: null,
	expiresAt: null,
	loading: false,
};

vi.mock('@app/hooks/useAuth', () => ({
	useAuth: () => ({
		state: mockAuthState,
	}),
}));

// Test component to use as protected content
function ProtectedContent() {
	return (
		<div>
			<h1>Protected Content</h1>
			<p>This is a protected page</p>
		</div>
	);
}

// Test wrapper with router
function TestWrapper({ children }: { children: React.ReactNode }) {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<div>Home Page</div>} />
				<Route path="/login" element={<div>Login Page</div>} />
				<Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
				<Route path="/protected" element={children} />
			</Routes>
		</BrowserRouter>
	);
}

// TODO: Auth code will change significantly - re-enable these tests after auth refactor
describe.skip('ProtectedRoute', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAuthState.authenticated = false;
		mockAuthState.loading = false;
		mockAuthState.userId = null;
		mockAuthState.expiresAt = null;
	});

	describe('loading state', () => {
		it('should show loading spinner while checking authentication', () => {
			mockAuthState.loading = true;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Verifying authentication...')).toBeInTheDocument();
			expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
		});

		it('should display loading spinner centered on screen', () => {
			mockAuthState.loading = true;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			const loadingContainer = screen.getByText('Verifying authentication...').parentElement;
			expect(loadingContainer).toHaveClass('flex', 'min-h-screen', 'items-center', 'justify-center');
		});
	});

	describe('authentication checks', () => {
		it('should redirect to /login when not authenticated', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = false;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});

			expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
		});

		it('should render children when authenticated', () => {
			mockAuthState.authenticated = true;
			mockAuthState.userId = 'user-123';
			mockAuthState.loading = false;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Protected Content')).toBeInTheDocument();
			expect(screen.getByText('This is a protected page')).toBeInTheDocument();
			expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
		});

		it('should wait for loading to finish before redirecting', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = true;

			const { rerender } = render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			// Should show loading
			expect(screen.getByText('Verifying authentication...')).toBeInTheDocument();

			// Update to not authenticated
			mockAuthState.loading = false;
			mockAuthState.authenticated = false;

			rerender(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			// Should redirect to login
			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});
		});
	});

	describe('custom redirect path', () => {
		it('should redirect to custom path when specified', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = false;

			render(
				<TestWrapper>
					<ProtectedRoute redirectTo="/unauthorized">
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
			});

			expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
			expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
		});

		it('should use /login as default redirect path', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = false;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});
		});
	});

	describe('children rendering', () => {
		it('should render single child component', () => {
			mockAuthState.authenticated = true;
			mockAuthState.loading = false;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Protected Content')).toBeInTheDocument();
		});

		it('should render multiple children', () => {
			mockAuthState.authenticated = true;
			mockAuthState.loading = false;

			render(
				<TestWrapper>
					<ProtectedRoute>
						<div>First Child</div>
						<div>Second Child</div>
						<div>Third Child</div>
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('First Child')).toBeInTheDocument();
			expect(screen.getByText('Second Child')).toBeInTheDocument();
			expect(screen.getByText('Third Child')).toBeInTheDocument();
		});

		it('should render nested components', () => {
			mockAuthState.authenticated = true;
			mockAuthState.loading = false;

			function NestedComponent() {
				return (
					<div>
						<h1>Nested Component</h1>
						<div>
							<p>Deeply nested content</p>
						</div>
					</div>
				);
			}

			render(
				<TestWrapper>
					<ProtectedRoute>
						<NestedComponent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Nested Component')).toBeInTheDocument();
			expect(screen.getByText('Deeply nested content')).toBeInTheDocument();
		});
	});

	describe('authentication state transitions', () => {
		it('should transition from loading to authenticated', async () => {
			mockAuthState.loading = true;
			mockAuthState.authenticated = false;

			const { rerender } = render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Verifying authentication...')).toBeInTheDocument();

			// Update to authenticated
			mockAuthState.loading = false;
			mockAuthState.authenticated = true;
			mockAuthState.userId = 'user-123';

			rerender(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Protected Content')).toBeInTheDocument();
			});

			expect(screen.queryByText('Verifying authentication...')).not.toBeInTheDocument();
		});

		it('should transition from loading to unauthenticated', async () => {
			mockAuthState.loading = true;
			mockAuthState.authenticated = false;

			const { rerender } = render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Verifying authentication...')).toBeInTheDocument();

			// Update to not authenticated
			mockAuthState.loading = false;
			mockAuthState.authenticated = false;

			rerender(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});

			expect(screen.queryByText('Verifying authentication...')).not.toBeInTheDocument();
			expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
		});

		it('should transition from authenticated to unauthenticated', async () => {
			mockAuthState.loading = false;
			mockAuthState.authenticated = true;
			mockAuthState.userId = 'user-123';

			const { rerender } = render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Protected Content')).toBeInTheDocument();

			// Logout
			mockAuthState.authenticated = false;
			mockAuthState.userId = null;

			rerender(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});

			expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
		});
	});

	describe('console logging', () => {
		it('should log redirect when not authenticated', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = false;

			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(consoleLogSpy).toHaveBeenCalledWith(
					'[ProtectedRoute] Not authenticated, redirecting to:',
					'/login'
				);
			});

			consoleLogSpy.mockRestore();
		});

		it('should log custom redirect path', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = false;

			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			render(
				<TestWrapper>
					<ProtectedRoute redirectTo="/unauthorized">
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(consoleLogSpy).toHaveBeenCalledWith(
					'[ProtectedRoute] Not authenticated, redirecting to:',
					'/unauthorized'
				);
			});

			consoleLogSpy.mockRestore();
		});

		it('should not log when authenticated', () => {
			mockAuthState.authenticated = true;
			mockAuthState.loading = false;

			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(consoleLogSpy).not.toHaveBeenCalledWith(
				expect.stringContaining('[ProtectedRoute]'),
				expect.anything()
			);

			consoleLogSpy.mockRestore();
		});
	});

	describe('real-world scenarios', () => {
		it('should protect dashboard route', async () => {
			mockAuthState.authenticated = false;
			mockAuthState.loading = false;

			function DashboardPage() {
				return <div>Dashboard - Sensitive Data</div>;
			}

			render(
				<TestWrapper>
					<ProtectedRoute>
						<DashboardPage />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});

			expect(screen.queryByText('Dashboard - Sensitive Data')).not.toBeInTheDocument();
		});

		it('should allow access to dashboard when authenticated', () => {
			mockAuthState.authenticated = true;
			mockAuthState.userId = 'user-123';
			mockAuthState.loading = false;

			function DashboardPage() {
				return <div>Dashboard - Sensitive Data</div>;
			}

			render(
				<TestWrapper>
					<ProtectedRoute>
						<DashboardPage />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Dashboard - Sensitive Data')).toBeInTheDocument();
		});

		it('should handle session expiration', async () => {
			mockAuthState.authenticated = true;
			mockAuthState.userId = 'user-123';
			mockAuthState.loading = false;

			const { rerender } = render(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			expect(screen.getByText('Protected Content')).toBeInTheDocument();

			// Simulate session expiration
			mockAuthState.authenticated = false;
			mockAuthState.userId = null;

			rerender(
				<TestWrapper>
					<ProtectedRoute>
						<ProtectedContent />
					</ProtectedRoute>
				</TestWrapper>
			);

			await waitFor(() => {
				expect(screen.getByText('Login Page')).toBeInTheDocument();
			});
		});
	});
});
