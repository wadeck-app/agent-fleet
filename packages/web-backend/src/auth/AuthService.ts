/**
 * ===========================================================================================
 * AUTH SERVICE - AUTHENTICATION ABSTRACTION
 * ===========================================================================================
 *
 * Provides authentication interface for backend security layer.
 * This abstraction allows different authentication strategies (JWT, session-based, OAuth, etc.)
 *
 * Security responsibilities:
 * - User authentication (login)
 * - Token generation and validation
 * - Token refresh
 * - Logout (token invalidation)
 *
 * ===========================================================================================
 */

/**
 * Token payload returned after verification
 */
export interface TokenPayload {
	userId: string;
	expiresAt: number; // Timestamp in milliseconds
}

/**
 * Login response containing tokens and user info
 */
export interface LoginResponse {
	userId: string;
	accessToken: string;
	refreshToken: string;
	expiresIn: number; // Seconds
}

/**
 * Refresh token response
 */
export interface RefreshTokenResponse {
	userId: string;
	accessToken: string;
	expiresIn: number; // Seconds
}

/**
 * Authentication service interface
 *
 * Implementations:
 * - MockAuthService: In-memory JWT-based authentication for development/testing
 * - JwtAuthService: Database-backed JWT authentication for production
 * - SessionAuthService: Session-based authentication
 */
export interface AuthService {
	/**
	 * Authenticate user with email and password
	 *
	 * @param email - User email
	 * @param password - User password
	 * @returns Login response with tokens
	 * @throws Error if credentials are invalid
	 */
	login(email: string, password: string): Promise<LoginResponse>;

	/**
	 * Verify access token
	 * Fast validation for WebSocket requests
	 *
	 * @param token - Access token to verify
	 * @returns Token payload with userId and expiration
	 * @throws Error if token is invalid or expired
	 */
	verifyAccessToken(token: string): Promise<TokenPayload>;

	/**
	 * Refresh access token using refresh token
	 *
	 * @param refreshToken - Refresh token
	 * @returns New access token with userId
	 * @throws Error if refresh token is invalid or expired
	 */
	refreshToken(refreshToken: string): Promise<RefreshTokenResponse>;

	/**
	 * Logout user (invalidate tokens)
	 *
	 * @param userId - User ID to logout
	 */
	logout(userId: string): Promise<void>;
}
