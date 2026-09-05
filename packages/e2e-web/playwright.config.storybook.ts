import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

import { PIXEL_9A } from './utils/devices';

// Generate unique RUN_ID early (before webServer starts)
// This allows webServer to use it for port file naming
const runId = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
process.env.RUN_ID = runId;

/**
 * Playwright Configuration for Storybook Component Tests
 * Tests isolated components without backend
 * @see https://playwright.dev/docs/test-configuration
 */

// Shared device configurations
const desktopDevice = {
	...devices['Desktop Chrome'],
	viewport: { width: 1280, height: 720 },
};

const mobileDevice = {
	viewport: { width: PIXEL_9A.width, height: PIXEL_9A.height },
	userAgent: PIXEL_9A.userAgent,
	deviceScaleFactor: PIXEL_9A.deviceScaleFactor,
	isMobile: PIXEL_9A.isMobile,
	hasTouch: PIXEL_9A.hasTouch,
};

const projectRoot = path.resolve(__dirname, '../..');
const packageName = 'e2e-web';
const thisPackage = `packages/${packageName}`;
const thisTestFolder = 'test-storybook';

export default defineConfig({
	// Storybook tests directory
	testDir: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}`),

	outputDir: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/_misc`),

	// Global teardown to clean up port files
	globalTeardown: path.resolve(projectRoot, `${thisPackage}/playwright-hooks/global-teardown-storybook.ts`),

	// Maximum timeout for each test (30 seconds)
	timeout: 30000,

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
				outputFolder: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/storybook-html`),
				open: process.env.PLAYWRIGHT_HTML_OPEN || 'on-failure',
			},
		],
		[
			'json',
			{
				outputFile: path.resolve(
					projectRoot,
					`${thisPackage}/${thisTestFolder}/_results/storybook-results.json`
				),
			},
		],
		['list'],
	],

	// Global test configuration
	use: {
		// Base URL for Storybook
		// PLACEHOLDER: Overridden at runtime by e2e/hooks-storybook.ts which reads dynamic port from file
		// The actual URL is determined after webServer starts and writes .storybook-port-${RUN_ID}.json
		baseURL: 'http://storybook-placeholder:9999',

		// Capture traces on failure
		trace: 'on-first-retry',

		// Capture screenshots on failure
		screenshot: 'only-on-failure',

		// Capture videos on failure
		video: 'retain-on-failure',

		// Timeout for actions (10 seconds)
		actionTimeout: 10000,

		// Timeout for navigation
		navigationTimeout: 15000,
	},

	// Test projects - separate visual regression from functional tests
	projects: [
		// Functional Tests - Desktop
		{
			name: 'functional-desktop',
			testMatch: '**/*.storybook.spec.ts',
			use: desktopDevice,
		},
		//  Not useful now
		// // Functional Tests - Mobile
		// {
		// 	name: 'functional-mobile',
		// 	testMatch: '**/*.storybook.spec.ts',
		// 	use: mobileDevice,
		// },
	],

	// Web server for Storybook
	webServer: {
		// IMPORTANT: Uses launcher script with try-fail-retry to find free port
		// This avoids TOCTOU race conditions and ensures reliable port allocation
		command: `node ${projectRoot}/${thisPackage}/scripts/start-storybook-with-retry.js`,
		wait: {
			stdout: /Storybook ready!/,
		},
		// The launcher script outputs "Storybook successfully started" when ready
		timeout: 120000,
		// IMPORTANT: Never reuse an existing server to avoid impacting other environments
		reuseExistingServer: false,
		// Display logs to diagnose startup issues
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
