import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const runId = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
process.env.RUN_ID = runId;

const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
const projectRoot = path.resolve(__dirname, '../..');
const packageName = 'e2e-web';
const thisPackage = `packages/${packageName}`;
const thisTestFolder = 'test-lego-visual';

export default defineConfig({
	testDir: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}`),
	outputDir: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/_misc`),
	globalTeardown: require.resolve(
		path.resolve(projectRoot, `${thisPackage}/playwright-hooks/global-teardown-web-server.ts`)
	),
	timeout: 30_000,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [
		[
			'html',
			{
				outputFolder: path.resolve(projectRoot, `${thisPackage}/${thisTestFolder}/_results/html`),
				open: 'on-failure',
			},
		],
		['list'],
	],
	use: {
		baseURL: 'http://webapp-placeholder:9999',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
	},
	projects: [
		{
			name: 'lego-visual',
			testMatch: '**/*.visual.ts',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
		},
	],
	webServer: {
		command: `node ${projectRoot}/${thisPackage}/scripts/start-webapp-with-retry.js`,
		wait: {
			stdout: /Webapp frontend successfully started/,
		},
		timeout: 120_000,
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			VITE_E2E_PORT: (5050 + workspaceId * 100).toString(),
			VITE_WORKSPACE_ID: workspaceId.toString(),
			VITE_API_BASE_URL: 'http://e2e-backend-placeholder:9999',
		},
	},
});
