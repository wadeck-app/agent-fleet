import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

import { PIXEL_9A } from './utils/devices';

// Generate unique RUN_ID early (before webServer starts)
// This allows webServer to use it for port file naming
const runId = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
process.env.RUN_ID = runId;

// Calculate base E2E frontend port from WORKSPACE_ID for parallel testing
// WORKSPACE_ID=0 → 5050, WORKSPACE_ID=1 → 5150, WORKSPACE_ID=2 → 5250, etc.
const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
const e2eFrontendPort = 5050 + workspaceId * 100;

const projectRoot = path.resolve(__dirname, '../..');
const packageName = 'e2e-web';
const thisPackage = `packages/${packageName}`;
const thisTestFolder = 'test-integration';

/**
 * Playwright Configuration for E2E tests
 * One backend server per worker for complete isolation
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	// E2E tests directory
	testDir: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}`),

	outputDir: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/_misc`),

	// Global setup: start N backend servers (one per worker)
	globalSetup: require.resolve(
		path.resolve(projectRoot, `${thisPackage}/playwright-hooks/global-setup-web-server.ts`)
	),

	// Global teardown: stop all servers
	globalTeardown: require.resolve(
		path.resolve(projectRoot, `${thisPackage}/playwright-hooks/global-teardown-web-server.ts`)
	),

	// Maximum timeout for each test (30 seconds)
	timeout: 30_000,

	// Enable full parallelism
	fullyParallel: true,
	workers: process.env.CI ? 2 : 5,

	// No retries - fix flaky tests instead
	retries: 0,

	// Reporter to display results
	reporter: [
		[
			'html',
			{
				outputFolder: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/html`),
				open: process.env.PLAYWRIGHT_HTML_OPEN || 'on-failure',
			},
		],
		[
			'json',
			{
				outputFile: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/results.json`),
			},
		],
		['list'],
	],

	// Global test configuration
	use: {
		// Base URL for the application (frontend)
		// PLACEHOLDER: Overridden at runtime by e2e/hooks-web-server.ts which reads dynamic port from file
		// The actual URL is determined after webServer starts and writes .webapp-port-${RUN_ID}.json
		baseURL: 'http://webapp-placeholder:9999',

		// Capture traces on failure
		trace: 'on-first-retry',

		// Capture screenshots on failure
		screenshot: 'only-on-failure',

		// Capture videos on failure
		video: 'retain-on-failure',

		// Timeout for actions (10 seconds)
		actionTimeout: 10_000,

		// Timeout for navigation
		navigationTimeout: 15_000,
	},

	// Test projects (different browsers/viewports)
	projects: [
		{
			name: 'chromium-desktop',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1280, height: 720 },
			},
		},
		{
			name: 'chromium-mobile',
			use: {
				viewport: { width: PIXEL_9A.width, height: PIXEL_9A.height },
				userAgent: PIXEL_9A.userAgent,
				deviceScaleFactor: PIXEL_9A.deviceScaleFactor,
				isMobile: PIXEL_9A.isMobile,
				hasTouch: PIXEL_9A.hasTouch,
			},
		},
	],

	// Web server for frontend only (backend managed by global-setup)
	webServer: {
		// IMPORTANT: Uses launcher script with try-fail-retry to find free port
		// This avoids TOCTOU race conditions and ensures reliable port allocation
		command: `node ${projectRoot}/${thisPackage}/scripts/start-webapp-with-retry.js`,
		wait: {
			stdout: /Webapp frontend successfully started/,
		},
		// The launcher script outputs "Webapp frontend successfully started" when ready
		timeout: 10_000,
		// IMPORTANT: Never reuse an existing server to avoid impacting other environments
		reuseExistingServer: false,
		// Display logs to diagnose startup issues
		stdout: 'pipe',
		stderr: 'pipe',
		// Pass calculated port to the dev:only-for-e2e script
		env: {
			VITE_E2E_PORT: e2eFrontendPort.toString(),
			VITE_WORKSPACE_ID: workspaceId.toString(),
			// will be replaced by page.route in tests/e2e/hooks-web-server.ts
			// Note: Routes already include /api prefix (e.g., /api/books)
			VITE_API_BASE_URL: 'http://e2e-backend-placeholder:9999',
		},
	},
});
