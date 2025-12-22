/**
 * Token Refresh Manager
 *
 * Manages automatic token refresh before expiration to maintain seamless
 * authentication for WebSocket connections and HTTP requests.
 *
 * Key Features:
 * - Automatic refresh scheduling before token expiration
 * - Uses HTTP_ONLY cookies for security (credentials: 'include')
 * - Callback hooks for success and failure
 * - Prevents concurrent refresh attempts
 * - Automatic rescheduling after successful refresh
 *
 * Security:
 * - Tokens are NEVER exposed to JavaScript
 * - Refresh happens via HTTP with HTTP_ONLY cookies
 * - Browser automatically sends cookies with credentials: 'include'
 *
 * @example
 * ```typescript
 * const refreshManager = new TokenRefreshManager({
 *   refreshEndpoint: '/api/auth/refresh',
 *   refreshBeforeExpiry: 60000, // Refresh 1 minute before expiry
 *   onRefreshSuccess: (expiresAt) => {
 *     console.log('Token refreshed, expires at:', expiresAt);
 *   },
 *   onRefreshFailed: (error) => {
 *     console.error('Token refresh failed:', error);
 *     // Redirect to login
 *   }
 * });
 *
 * // Start automatic refresh when WebSocket connects
 * refreshManager.startAutoRefresh(tokenExpiresAt);
 *
 * // Stop when disconnecting
 * refreshManager.stopAutoRefresh();
 * ```
 */

/**
 * Token Refresh Configuration
 */
export interface TokenRefreshConfig {
	/**
	 * HTTP endpoint for token refresh (e.g., '/api/auth/refresh')
	 * Must accept POST requests and return { expiresAt: number }
	 */
	refreshEndpoint: string;

	/**
	 * Time in milliseconds before expiry to trigger refresh
	 * @default 60000 (1 minute)
	 * @example 60000 = refresh 1 minute before token expires
	 */
	refreshBeforeExpiry: number;

	/**
	 * Callback invoked when token refresh succeeds
	 * @param expiresAt - New token expiration timestamp (milliseconds)
	 */
	onRefreshSuccess?: (expiresAt: number) => void;

	/**
	 * Callback invoked when token refresh fails
	 * @param error - Error that caused the failure
	 */
	onRefreshFailed?: (error: Error) => void;
}

/**
 * Token Refresh Manager
 *
 * Handles automatic token refresh before expiration using HTTP_ONLY cookies.
 */
export class TokenRefreshManager {
	/**
	 * Timer for scheduled refresh
	 */
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Flag to prevent concurrent refresh attempts
	 */
	private isRefreshing = false;

	/**
	 * Create a new TokenRefreshManager
	 * @param config - Token refresh configuration
	 */
	constructor(private config: TokenRefreshConfig) {}

	/**
	 * Start automatic token refresh
	 *
	 * Schedules a token refresh to occur before the token expires.
	 * Called when WebSocket connects with tokenExpiresAt.
	 *
	 * @param expiresAt - Token expiration timestamp in milliseconds
	 *
	 * @example
	 * ```typescript
	 * // WebSocket sends: { type: 'connected', tokenExpiresAt: 1234567890000 }
	 * refreshManager.startAutoRefresh(1234567890000);
	 * ```
	 */
	startAutoRefresh(expiresAt: number): void {
		// Cancel any existing scheduled refresh
		this.stopAutoRefresh();

		const now = Date.now();
		const timeUntilExpiry = expiresAt - now;

		// Calculate when to refresh (before expiry)
		const refreshTime = Math.max(0, timeUntilExpiry - this.config.refreshBeforeExpiry);

		console.log(
			`[TokenRefresh] Scheduled in ${Math.round(refreshTime / 1000)}s ` +
				`(expires in ${Math.round(timeUntilExpiry / 1000)}s)`
		);

		this.refreshTimer = setTimeout(() => {
			this.refreshToken().catch(error => {
				console.error('[TokenRefresh] Auto-refresh failed', error);
			});
		}, refreshTime);
	}

	/**
	 * Stop automatic refresh
	 *
	 * Cancels any scheduled token refresh.
	 * Called when disconnecting from WebSocket.
	 */
	stopAutoRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	/**
	 * Manually trigger token refresh
	 *
	 * Sends a POST request to the refresh endpoint with credentials: 'include'
	 * to automatically send HTTP_ONLY cookies.
	 *
	 * Security: Tokens are NEVER exposed to JavaScript. The browser handles
	 * cookie transmission automatically.
	 *
	 * @returns Promise resolving to new token expiration timestamp
	 * @throws Error if refresh fails
	 *
	 * @example
	 * ```typescript
	 * // Manual refresh
	 * const { expiresAt } = await refreshManager.refreshToken();
	 * console.log('Token valid until:', new Date(expiresAt));
	 * ```
	 */
	async refreshToken(): Promise<{ expiresAt: number }> {
		// Prevent concurrent refresh attempts
		if (this.isRefreshing) {
			console.log('[TokenRefresh] Already in progress');
			return { expiresAt: 0 };
		}

		this.isRefreshing = true;

		try {
			console.log('[TokenRefresh] Refreshing token...');

			// SECURITY: credentials: 'include' sends HTTP_ONLY cookies
			const response = await fetch(this.config.refreshEndpoint, {
				method: 'POST',
				credentials: 'include', // CRITICAL: Send HTTP_ONLY cookies
			});

			if (!response.ok) {
				throw new Error(`Token refresh failed: ${response.status}`);
			}

			const { expiresAt } = await response.json();

			console.log(`[TokenRefresh] Success, expires at ${new Date(expiresAt).toISOString()}`);

			// Schedule next refresh
			this.startAutoRefresh(expiresAt);

			// Notify success
			this.config.onRefreshSuccess?.(expiresAt);

			return { expiresAt };
		} catch (error) {
			console.error('[TokenRefresh] Failed', error);

			// Notify failure
			this.config.onRefreshFailed?.(error as Error);

			throw error;
		} finally {
			this.isRefreshing = false;
		}
	}

	/**
	 * Check if a refresh is currently in progress
	 * @returns True if refreshing
	 */
	isCurrentlyRefreshing(): boolean {
		return this.isRefreshing;
	}

	/**
	 * Check if auto-refresh is active
	 * @returns True if refresh is scheduled
	 */
	isAutoRefreshActive(): boolean {
		return this.refreshTimer !== null;
	}
}
