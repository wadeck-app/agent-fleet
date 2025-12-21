/**
 * API Configuration
 * Calculates the API base URL based on workspace ID and host
 */

//NOMERGE
const debug = true;

/**
 * Get the API base URL
 * Priority:
 * 0. Storybook mode: Use relative URL for MSW interception
 * 1. Production mode: Use relative URL based on current host
 * 2. VITE_API_BASE_URL (manual override for integration)
 * 3. VITE_UNIT_TEST for unit test
 * 4. Dev mode: use projectId, workspaceId
 *
 * @returns Complete API base URL (e.g., "http://localhost:3000/api")
 */
export function getApiBaseUrl(): string {
	// Priority 0: Storybook mode - use relative URL for MSW interception
	// MSW can only intercept relative URLs, not absolute URLs
	if (import.meta.env.STORYBOOK) {
		if (debug) console.info('API Base URL: Using relative URL for Storybook/MSW => /api');
		return '/api';
	}

	// Priority 1: Production mode - use relative URL
	// In production, frontend and API are served from the same server
	if (import.meta.env.PROD) {
		if (debug) console.info('API Base URL: Using relative URL for production =>', `${window.location.origin}/api`);
		return `${window.location.origin}/api`;
	}

	// Priority 2: Manual override
	const manualUrl = import.meta.env.VITE_API_BASE_URL;
	if (manualUrl) {
		if (debug) console.info('API Base URL: Using manual override =>', manualUrl);
		return manualUrl;
	}

	// Priority 3: Unit test mode - force to mock the server
	if (import.meta.env.VITE_UNIT_TEST) {
		if (debug) console.info('API Base URL: Unit test mode detected, no api url');
		return `http://MOCK_ME_FOR_UNIT_TEST/api`;
	}

	// Priority 4: In dev, calculate from host + project ID + workspace ID
	if (import.meta.env.DEV) {
		const host = import.meta.env.VITE_API_HOST || 'localhost';
		const projectId = parseInt(import.meta.env.VITE_PROJECT_ID || '0', 10);
		const workspaceId = parseInt(import.meta.env.VITE_WORKSPACE_ID || '0', 10);

		const port = 3000 + projectId * 10 + workspaceId * 100;

		return `http://${host}:${port}/api`;
	}

	throw new Error('❌❌❌ No STORYBOOK, PROD, VITE_API_BASE_URL, VITE_UNIT_TEST, DEV defined ❌❌❌');
}

/**
 * API base URL (cached)
 * Use this constant instead of calculating every time
 */
export const API_BASE_URL = getApiBaseUrl();
