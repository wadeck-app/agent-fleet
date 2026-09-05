import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Authentication State
 *
 * Represents the current authentication status of the user.
 */
export interface AuthState {
	/**
	 * Whether the user is authenticated
	 */
	authenticated: boolean;

	/**
	 * User ID (if authenticated)
	 */
	userId: string | null;

	/**
	 * Token expiration timestamp (if authenticated)
	 */
	expiresAt: number | null;

	/**
	 * Whether auth status is being checked
	 */
	loading: boolean;
}

/**
 * Authentication Hook Return Type
 */
export interface UseAuthReturn {
	/**
	 * Current authentication state
	 */
	state: AuthState;

	/**
	 * Login with email and password
	 *
	 * @param email - User email
	 * @param password - User password
	 * @returns Promise resolving to user info on success
	 * @throws Error if login fails
	 */
	login(email: string, password: string): Promise<{ userId: string; expiresAt: number }>;

	/**
	 * Logout the current user
	 *
	 * Clears authentication cookies and redirects to /login.
	 *
	 * @returns Promise resolving when logout is complete
	 */
	logout(): Promise<void>;

	/**
	 * Check if the session is still valid
	 *
	 * Verifies the authentication status by checking the session cookie.
	 *
	 * @returns Promise resolving to true if authenticated
	 */
	checkSession(): Promise<boolean>;
}

/**
 * Authentication Hook
 *
 * Manages authentication state and provides login/logout/session check functionality.
 *
 * Features:
 * - Login via POST /api/auth/login (sets HTTP_ONLY cookies)
 * - Logout via POST /api/auth/logout (clears cookies)
 * - Session check via GET /api/auth/session
 * - Automatic session check on mount
 * - Uses fetch with credentials: 'include' for cookie handling
 *
 * @example
 * ```tsx
 * function LoginPage() {
 *   const { state, login } = useAuth();
 *   const [email, setEmail] = useState('');
 *   const [password, setPassword] = useState('');
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     try {
 *       await login(email, password);
 *       // Redirect handled by login()
 *     } catch (error) {
 *       console.error('Login failed:', error);
 *     }
 *   };
 *
 *   if (state.loading) {
 *     return <LoadingSpinner />;
 *   }
 *
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function LogoutButton() {
 *   const { logout } = useAuth();
 *
 *   return <button onClick={logout}>Logout</button>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function ProtectedPage() {
 *   const { state, checkSession } = useAuth();
 *
 *   useEffect(() => {
 *     checkSession();
 *   }, [checkSession]);
 *
 *   if (!state.authenticated) {
 *     return <Navigate to="/login" />;
 *   }
 *
 *   return <div>Protected Content</div>;
 * }
 * ```
 */
export function useAuth(): UseAuthReturn {
	const navigate = useNavigate();

	const [state, setState] = useState<AuthState>({
		authenticated: false,
		userId: null,
		expiresAt: null,
		loading: true,
	});

	/**
	 * Login with email and password
	 */
	const login = useCallback(
		async (email: string, password: string) => {
			setState(prev => ({ ...prev, loading: true }));

			try {
				const response = await fetch('/api/auth/login', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include', // Send cookies
					body: JSON.stringify({ email, password }),
				});

				if (!response.ok) {
					const error = await response.json().catch(() => ({ message: 'Login failed' }));
					throw new Error((error instanceof Error ? error.message : String(error)) || `Login failed: ${response.status}`);
				}

				const data = await response.json();
				const { userId, expiresAt } = data;

				setState({
					authenticated: true,
					userId,
					expiresAt,
					loading: false,
				});

				console.log('[useAuth] Login successful:', userId);

				// Redirect to home page
				navigate('/', { replace: true });

				return { userId, expiresAt };
			} catch (error) {
				console.error('[useAuth] Login failed:', error);
				setState({
					authenticated: false,
					userId: null,
					expiresAt: null,
					loading: false,
				});
				throw error;
			}
		},
		[navigate]
	);

	/**
	 * Logout the current user
	 */
	const logout = useCallback(async () => {
		setState(prev => ({ ...prev, loading: true }));

		try {
			const response = await fetch('/api/auth/logout', {
				method: 'POST',
				credentials: 'include', // Send cookies
			});

			if (!response.ok) {
				console.warn('[useAuth] Logout request failed:', response.status);
				// Continue anyway - clear local state
			}

			setState({
				authenticated: false,
				userId: null,
				expiresAt: null,
				loading: false,
			});

			console.log('[useAuth] Logged out');

			// Redirect to login page
			navigate('/login', { replace: true });
		} catch (error) {
			console.error('[useAuth] Logout error:', error);

			// Clear state anyway
			setState({
				authenticated: false,
				userId: null,
				expiresAt: null,
				loading: false,
			});

			// Redirect to login page
			navigate('/login', { replace: true });
		}
	}, [navigate]);

	/**
	 * Check if the session is still valid
	 */
	const checkSession = useCallback(async () => {
		setState(prev => ({ ...prev, loading: true }));

		try {
			const response = await fetch('/api/auth/session', {
				method: 'GET',
				credentials: 'include', // Send cookies
			});

			if (!response.ok) {
				setState({
					authenticated: false,
					userId: null,
					expiresAt: null,
					loading: false,
				});
				return false;
			}

			const data = await response.json();
			const { authenticated, userId, expiresAt } = data;

			if (authenticated) {
				setState({
					authenticated: true,
					userId,
					expiresAt,
					loading: false,
				});
				console.log('[useAuth] Session valid:', userId);
				return true;
			} else {
				setState({
					authenticated: false,
					userId: null,
					expiresAt: null,
					loading: false,
				});
				return false;
			}
		} catch (error) {
			console.error('[useAuth] Session check failed:', error);
			setState({
				authenticated: false,
				userId: null,
				expiresAt: null,
				loading: false,
			});
			return false;
		}
	}, []);

	/**
	 * Check session on mount
	 */
	useEffect(() => {
		checkSession();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		state,
		login,
		logout,
		checkSession,
	};
}
