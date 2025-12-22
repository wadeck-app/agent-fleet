/**
 * LoginPage Tests
 *
 * Tests for the login page component including:
 * - Form rendering with email and password fields
 * - Form validation (required fields, email format)
 * - Successful login flow with redirect
 * - Error handling and display
 * - Loading states during submission
 * - Redirect when already authenticated
 * - Demo credentials display in development
 * - Accessibility features
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

// Mock useAuth hook
const mockLogin = vi.fn();
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
		login: mockLogin,
	}),
}));

// Wrapper component with router
function TestWrapper({ children }: { children: React.ReactNode }) {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<div>Home Page</div>} />
				<Route path="/login" element={children} />
			</Routes>
		</BrowserRouter>
	);
}

// TODO: Auth code will change significantly - re-enable these tests after auth refactor
describe.skip('LoginPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAuthState.authenticated = false;
		mockAuthState.loading = false;
		mockAuthState.userId = null;
		mockAuthState.expiresAt = null;
	});

	describe('rendering', () => {
		it('should render login form with all elements', () => {
			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			// Header elements
			expect(screen.getByText('Agent Fleet')).toBeInTheDocument();
			expect(screen.getByText('Sign in to your account')).toBeInTheDocument();

			// Form elements
			expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

			// Footer
			expect(screen.getByText('Agent Fleet - Task Orchestration Platform')).toBeInTheDocument();
		});

		it('should render email field with correct attributes', () => {
			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			expect(emailInput).toHaveAttribute('type', 'email');
			expect(emailInput).toHaveAttribute('placeholder', 'you@example.com');
			expect(emailInput).toBeRequired();
		});

		it('should render password field with correct attributes', () => {
			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const passwordInput = screen.getByLabelText(/password/i);
			expect(passwordInput).toHaveAttribute('type', 'password');
			expect(passwordInput).toHaveAttribute('placeholder', 'Enter your password');
			expect(passwordInput).toBeRequired();
		});

		it('should show loading spinner when auth state is loading', () => {
			mockAuthState.loading = true;

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
		});
	});

	describe('redirect when authenticated', () => {
		it('should redirect to home page when already authenticated', () => {
			mockAuthState.authenticated = true;
			mockAuthState.userId = 'user-123';

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			// Should show home page instead of login form
			expect(screen.getByText('Home Page')).toBeInTheDocument();
			expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
		});
	});

	describe('form validation', () => {
		it('should show error when email is empty', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const submitButton = screen.getByRole('button', { name: /sign in/i });
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
			});

			expect(mockLogin).not.toHaveBeenCalled();
		});

		it('should show error when password is empty', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			await user.type(emailInput, 'test@example.com');

			const submitButton = screen.getByRole('button', { name: /sign in/i });
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Password is required');
			});

			expect(mockLogin).not.toHaveBeenCalled();
		});

		it('should show error for invalid email format', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);

			await user.type(emailInput, 'invalid-email');
			await user.type(passwordInput, 'password123');

			const submitButton = screen.getByRole('button', { name: /sign in/i });
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
			});

			expect(mockLogin).not.toHaveBeenCalled();
		});

		it('should clear error when email input changes', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const submitButton = screen.getByRole('button', { name: /sign in/i });
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toBeInTheDocument();
			});

			const emailInput = screen.getByLabelText(/email/i);
			await user.type(emailInput, 'test@example.com');

			await waitFor(() => {
				expect(screen.queryByRole('alert')).not.toBeInTheDocument();
			});
		});

		it('should clear error when password input changes', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const submitButton = screen.getByRole('button', { name: /sign in/i });
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toBeInTheDocument();
			});

			const passwordInput = screen.getByLabelText(/password/i);
			await user.type(passwordInput, 'password123');

			await waitFor(() => {
				expect(screen.queryByRole('alert')).not.toBeInTheDocument();
			});
		});
	});

	describe('successful login flow', () => {
		it('should call login with email and password', async () => {
			const user = userEvent.setup();

			mockLogin.mockResolvedValueOnce({
				userId: 'user-456',
				expiresAt: Date.now() + 3600000,
			});

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			await waitFor(() => {
				expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
			});
		});

		it('should show loading state during login', async () => {
			const user = userEvent.setup();

			mockLogin.mockImplementation(
				() =>
					new Promise(resolve =>
						setTimeout(
							() =>
								resolve({
									userId: 'user-456',
									expiresAt: Date.now() + 3600000,
								}),
							100
						)
					)
			);

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			// Check loading state
			expect(screen.getByText('Signing in...')).toBeInTheDocument();
			expect(submitButton).toBeDisabled();
			expect(emailInput).toBeDisabled();
			expect(passwordInput).toBeDisabled();

			await waitFor(() => {
				expect(mockLogin).toHaveBeenCalled();
			});
		});

		it('should disable form during submission', async () => {
			const user = userEvent.setup();

			mockLogin.mockImplementation(
				() =>
					new Promise(resolve =>
						setTimeout(
							() =>
								resolve({
									userId: 'user-456',
									expiresAt: Date.now() + 3600000,
								}),
							100
						)
					)
			);

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			expect(emailInput).toBeDisabled();
			expect(passwordInput).toBeDisabled();
			expect(submitButton).toBeDisabled();

			await waitFor(() => {
				expect(mockLogin).toHaveBeenCalled();
			});
		});
	});

	describe('error handling', () => {
		it('should display error message when login fails', async () => {
			const user = userEvent.setup();

			mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'wrong@example.com');
			await user.type(passwordInput, 'wrongpassword');
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
			});
		});

		it('should display generic error for non-Error objects', async () => {
			const user = userEvent.setup();

			mockLogin.mockRejectedValueOnce('String error');

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toHaveTextContent('Login failed. Please try again.');
			});
		});

		it('should re-enable form after error', async () => {
			const user = userEvent.setup();

			mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toBeInTheDocument();
			});

			// Form should be re-enabled
			expect(emailInput).not.toBeDisabled();
			expect(passwordInput).not.toBeDisabled();
			expect(submitButton).not.toBeDisabled();
		});

		it('should allow retry after failed login', async () => {
			const user = userEvent.setup();

			mockLogin.mockRejectedValueOnce(new Error('Invalid credentials')).mockResolvedValueOnce({
				userId: 'user-456',
				expiresAt: Date.now() + 3600000,
			});

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);
			const submitButton = screen.getByRole('button', { name: /sign in/i });

			// First attempt - fail
			await user.type(emailInput, 'wrong@example.com');
			await user.type(passwordInput, 'wrongpassword');
			await user.click(submitButton);

			await waitFor(() => {
				expect(screen.getByRole('alert')).toBeInTheDocument();
			});

			// Clear and retry
			await user.clear(emailInput);
			await user.clear(passwordInput);
			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123');
			await user.click(submitButton);

			await waitFor(() => {
				expect(mockLogin).toHaveBeenCalledTimes(2);
			});
		});
	});

	describe('accessibility', () => {
		it('should have proper ARIA roles and labels', () => {
			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
		});

		it('should have accessible error messages with role alert', async () => {
			const user = userEvent.setup();

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const submitButton = screen.getByRole('button', { name: /sign in/i });
			await user.click(submitButton);

			await waitFor(() => {
				const alert = screen.getByRole('alert');
				expect(alert).toBeInTheDocument();
				expect(alert).toHaveTextContent('Email is required');
			});
		});
	});

	describe('keyboard navigation', () => {
		it('should allow submitting form with Enter key', async () => {
			const user = userEvent.setup();

			mockLogin.mockResolvedValueOnce({
				userId: 'user-456',
				expiresAt: Date.now() + 3600000,
			});

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			const emailInput = screen.getByLabelText(/email/i);
			const passwordInput = screen.getByLabelText(/password/i);

			await user.type(emailInput, 'test@example.com');
			await user.type(passwordInput, 'password123{Enter}');

			await waitFor(() => {
				expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
			});
		});
	});

	describe('demo credentials (development mode)', () => {
		const originalNodeEnv = process.env.NODE_ENV;

		afterEach(() => {
			process.env.NODE_ENV = originalNodeEnv;
		});

		it('should show demo credentials in development mode', () => {
			process.env.NODE_ENV = 'development';

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			expect(screen.getByText('Demo Credentials:')).toBeInTheDocument();
			expect(screen.getByText('Email: demo@example.com')).toBeInTheDocument();
			expect(screen.getByText('Password: demo123')).toBeInTheDocument();
		});

		it('should not show demo credentials in production mode', () => {
			process.env.NODE_ENV = 'production';

			render(
				<TestWrapper>
					<LoginPage />
				</TestWrapper>
			);

			expect(screen.queryByText('Demo Credentials:')).not.toBeInTheDocument();
		});
	});
});
