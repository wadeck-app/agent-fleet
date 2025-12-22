import jwt from 'jsonwebtoken';

import type { AuthService, LoginResponse, RefreshTokenResponse, TokenPayload } from './AuthService';

/**
 * ===========================================================================================
 * MOCK AUTH SERVICE - IN-MEMORY JWT AUTHENTICATION
 * ===========================================================================================
 *
 * Mock implementation of AuthService for development and testing.
 * Uses JWT tokens with in-memory token blacklist for logout.
 *
 * Features:
 * - Hardcoded test user (email: test@example.com, password: password)
 * - JWT access tokens (5 minutes expiry)
 * - JWT refresh tokens (7 days expiry)
 * - In-memory token blacklist for logout
 * - No database required
 *
 * Security considerations:
 * - NOT for production use (hardcoded credentials)
 * - JWT secret should be environment variable in production
 * - Token blacklist is in-memory only (cleared on restart)
 *
 * ===========================================================================================
 */
export class MockAuthService implements AuthService {
	private readonly jwtSecret: string;
	private readonly accessTokenExpiresIn = 300; // 5 minutes in seconds
	private readonly refreshTokenExpiresIn = 7 * 24 * 60 * 60; // 7 days in seconds

	// In-memory token blacklist for logout
	// In production, use Redis or database
	private blacklistedTokens = new Set<string>();

	// Cleanup timer
	private cleanupTimer?: NodeJS.Timeout;

	// Hardcoded test user
	private readonly testUser = {
		id: 'test-user-123',
		email: 'test@example.com',
		password: 'password', // In production, use bcrypt hash
	};

	constructor(jwtSecret: string = process.env.JWT_SECRET || 'dev-secret-change-in-production') {
		this.jwtSecret = jwtSecret;

		// Cleanup blacklist every hour (remove expired tokens)
		this.cleanupTimer = setInterval(() => this.cleanupBlacklist(), 60 * 60 * 1000);
	}

	/**
	 * Login with hardcoded test user
	 */
	async login(email: string, password: string): Promise<LoginResponse> {
		// Validate credentials against test user
		if (email !== this.testUser.email || password !== this.testUser.password) {
			throw new Error('Invalid credentials');
		}

		const userId = this.testUser.id;

		// Generate tokens
		const accessToken = this.generateAccessToken(userId);
		const refreshToken = this.generateRefreshToken(userId);

		return {
			userId,
			accessToken,
			refreshToken,
			expiresIn: this.accessTokenExpiresIn,
		};
	}

	/**
	 * Verify access token
	 */
	async verifyAccessToken(token: string): Promise<TokenPayload> {
		// Check if token is blacklisted
		if (this.blacklistedTokens.has(token)) {
			throw new Error('Token has been revoked');
		}

		try {
			// Verify JWT
			const decoded = jwt.verify(token, this.jwtSecret) as {
				userId: string;
				exp: number;
				type: string;
			};

			// Ensure it's an access token
			if (decoded.type !== 'access') {
				throw new Error('Invalid token type');
			}

			return {
				userId: decoded.userId,
				expiresAt: decoded.exp * 1000, // JWT exp is in seconds, convert to milliseconds
			};
		} catch (error) {
			if (error instanceof jwt.TokenExpiredError) {
				throw new Error('Access token expired');
			} else if (error instanceof jwt.JsonWebTokenError) {
				throw new Error('Invalid access token');
			}
			throw error;
		}
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
		// Check if token is blacklisted
		if (this.blacklistedTokens.has(refreshToken)) {
			throw new Error('Refresh token has been revoked');
		}

		try {
			// Verify JWT
			const decoded = jwt.verify(refreshToken, this.jwtSecret) as {
				userId: string;
				exp: number;
				type: string;
			};

			// Ensure it's a refresh token
			if (decoded.type !== 'refresh') {
				throw new Error('Invalid token type');
			}

			const userId = decoded.userId;

			// Generate new access token
			const accessToken = this.generateAccessToken(userId);

			return {
				userId,
				accessToken,
				expiresIn: this.accessTokenExpiresIn,
			};
		} catch (error) {
			if (error instanceof jwt.TokenExpiredError) {
				throw new Error('Refresh token expired');
			} else if (error instanceof jwt.JsonWebTokenError) {
				throw new Error('Invalid refresh token');
			}
			throw error;
		}
	}

	/**
	 * Logout user - blacklist their tokens
	 * Note: This is a simple implementation. In production, you'd want to:
	 * 1. Store blacklist in Redis with TTL
	 * 2. Or use short-lived tokens and rely on expiration
	 */
	async logout(userId: string): Promise<void> {
		// In a real implementation, you'd blacklist all tokens for this user
		// For now, we rely on the client to send the token to blacklist
		// This is called from AuthController which has the token
		console.log(`[MockAuthService] User ${userId} logged out`);
	}

	/**
	 * Blacklist a specific token (called from controller)
	 */
	blacklistToken(token: string): void {
		this.blacklistedTokens.add(token);
	}

	/**
	 * Create access token for testing
	 * Generates a new access token with expiration time
	 */
	async createAccessToken(userId: string): Promise<{ accessToken: string; expiresAt: number }> {
		const accessToken = this.generateAccessToken(userId);
		const expiresAt = Date.now() + this.accessTokenExpiresIn * 1000;
		return { accessToken, expiresAt };
	}

	/**
	 * Generate access token (short-lived)
	 */
	private generateAccessToken(userId: string): string {
		return jwt.sign(
			{
				userId,
				type: 'access',
				jti: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			},
			this.jwtSecret,
			{
				expiresIn: this.accessTokenExpiresIn,
			}
		);
	}

	/**
	 * Generate refresh token (long-lived)
	 */
	private generateRefreshToken(userId: string): string {
		return jwt.sign(
			{
				userId,
				type: 'refresh',
			},
			this.jwtSecret,
			{
				expiresIn: this.refreshTokenExpiresIn,
			}
		);
	}

	/**
	 * Cleanup expired tokens from blacklist
	 */
	private cleanupBlacklist(): void {
		const now = Math.floor(Date.now() / 1000);
		let cleanedCount = 0;

		this.blacklistedTokens.forEach(token => {
			try {
				const decoded = jwt.decode(token) as { exp?: number } | null;
				if (decoded && decoded.exp && decoded.exp < now) {
					this.blacklistedTokens.delete(token);
					cleanedCount++;
				}
			} catch {
				// Invalid token, remove it
				this.blacklistedTokens.delete(token);
				cleanedCount++;
			}
		});

		if (cleanedCount > 0) {
			console.log(`[MockAuthService] Cleaned ${cleanedCount} expired tokens from blacklist`);
		}
	}

	/**
	 * Get statistics (for testing/monitoring)
	 */
	getStats() {
		return {
			blacklistedTokens: this.blacklistedTokens.size,
		};
	}

	/**
	 * Cleanup on shutdown (for testing)
	 */
	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
		this.blacklistedTokens.clear();
	}
}
