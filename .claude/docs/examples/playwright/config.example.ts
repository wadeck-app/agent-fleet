import { defineConfig, devices } from '@playwright/test';

/**
 * PLAYWRIGHT CONFIGURATION BEST PRACTICES
 *
 * Recommended configuration for fast, reliable tests
 */

export default defineConfig({
	// Test timeout - 30s is reasonable for most tests
	timeout: 30_000,

	// Assertion timeout - 5s for auto-retrying assertions
	expect: {
		timeout: 5_000,
	},

	// Retry only in CI, not locally (faster feedback loop)
	retries: process.env.CI ? 1 : 0,

	// Limit workers in CI to avoid resource contention
	workers: process.env.CI ? 2 : undefined,

	// Reporter configuration
	reporter: [['html', { open: 'never' }], ['list'], process.env.CI ? ['github'] : ['line']],

	use: {
		// Base URL for navigation
		baseURL: 'http://localhost:3000',

		// Trace only on first retry (saves space)
		trace: 'on-first-retry',

		// Screenshot only on failure
		screenshot: 'only-on-failure',

		// Video only on failure
		video: 'retain-on-failure',

		// Viewport size
		viewport: { width: 1280, height: 720 },

		// Ignore HTTPS errors (for local dev)
		ignoreHTTPSErrors: true,

		// Action timeout (for individual actions like click, fill)
		actionTimeout: 10_000,
	},

	// Test directory
	testDir: './e2e/test-integration',

	// Projects for multiple browsers
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		// Uncomment to test in multiple browsers
		// {
		//   name: 'firefox',
		//   use: { ...devices['Desktop Firefox'] },
		// },
		// {
		//   name: 'webkit',
		//   use: { ...devices['Desktop Safari'] },
		// },
	],

	// Web server configuration (start dev server before tests)
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:3000',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});

// ==================== ALTERNATIVE: Multiple Environments ====================

export const multiEnvConfig = defineConfig({
	timeout: 30_000,
	expect: { timeout: 5_000 },
	retries: process.env.CI ? 1 : 0,

	projects: [
		{
			name: 'development',
			use: {
				baseURL: 'http://localhost:3000',
			},
		},
		{
			name: 'staging',
			use: {
				baseURL: 'https://staging.example.com',
			},
		},
		// Run with: npx playwright test --project=staging
	],
});

// ==================== ALTERNATIVE: Authenticated Tests ====================

export const authConfig = defineConfig({
	timeout: 30_000,
	expect: { timeout: 5_000 },

	// Global setup to create auth state
	globalSetup: require.resolve('./global-setup'),

	use: {
		baseURL: 'http://localhost:3000',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},

	projects: [
		{
			name: 'setup',
			testMatch: /.*\.setup\.ts/,
		},
		{
			name: 'authenticated',
			use: {
				storageState: 'auth-state.json', // Reuse auth
			},
			dependencies: ['setup'],
		},
	],
});
