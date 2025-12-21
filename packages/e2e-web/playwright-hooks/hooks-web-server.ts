/**
 * Playwright Hooks
 * Configures each worker to communicate with its own backend
 *
 * Approach: One backend server per worker for complete isolation
 * - Worker 0 → Backend port 4000
 * - Worker 1 → Backend port 4010
 * - etc.
 *
 * Redirects all frontend API requests (to port 3001) to the worker's backend port
 *
 * DEFENSE-IN-DEPTH: Verifies workspace ID matches before running tests
 */
import { test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

interface ServerInfo {
	port: number;
	pid: number;
}

interface TestFixtures {
	// Override baseURL dynamically from file
	baseURL: string;
}

interface WorkerFixtures {
	servers: ServerInfo[];
}

const debug = false;

const projectRoot = path.resolve(__dirname, '../../..');
const tempFolder = path.resolve(projectRoot, 'packages/e2e-web/temp');

/**
 * Verify the backend server is in the correct workspace and test run
 * This is a defense-in-depth measure to prevent cross-workspace and cross-terminal pollution
 */
async function verifyWorkspaceId(backendPort: number): Promise<void> {
	const expectedWorkspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
	const expectedRunId = process.env.RUN_ID || 'unknown';
	const healthUrl = `http://localhost:${backendPort}/api/test/health`;

	try {
		// Add timeout to prevent hanging if backend isn't responding
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		debug && console.log(`🔍 Verifying backend at ${healthUrl}...`);
		const response = await fetch(healthUrl, {
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		if (!response.ok) {
			console.error(`❌ Health check failed: ${healthUrl} returned ${response.status}`);
			const text = await response.text().catch(() => 'Could not read response body');
			debug && console.error(`   Response body: ${text.substring(0, 200)}`);
			throw new Error(`Test health endpoint returned ${response.status} at ${healthUrl}`);
		}

		const data = await response.json();

		if (data.workspaceId !== expectedWorkspaceId) {
			throw new Error(
				`❌ WORKSPACE ID MISMATCH!\n` +
					`   Expected: ${expectedWorkspaceId}\n` +
					`   Server: ${data.workspaceId}\n` +
					`   This test is trying to connect to a server from a different workspace.\n` +
					`   Tests ABORTED to prevent cross-workspace pollution.`
			);
		}

		if (data.runId !== expectedRunId) {
			throw new Error(
				`❌ RUN_ID MISMATCH!\n` +
					`   Expected: ${expectedRunId}\n` +
					`   Server: ${data.runId}\n` +
					`   This backend belongs to a different test run (different terminal).\n` +
					`   Tests ABORTED to prevent cross-terminal pollution.`
			);
		}

		// Success - workspace ID and RUN_ID match
		//console.log(`✅ Workspace ID and RUN_ID verified: ${data.workspaceId}, ${data.runId}`);
	} catch (error) {
		console.error(`❌ Workspace verification failed:`, error);
		throw error;
	}
}

// Hook to redirect API requests to the worker's backend
export const test = base.extend<TestFixtures, WorkerFixtures>({
	// Worker-scoped fixture: reads server config ONCE per worker (not per test)
	// This dramatically reduces file I/O (from N tests to N workers)
	servers: [
		async ({}, use, workerInfo) => {
			const runId = process.env.RUN_ID || 'default';
			const filename = path.resolve(tempFolder, `.test-servers-${runId}.json`);
			try {
				const data = readFileSync(filename, 'utf-8');
				const servers: ServerInfo[] = JSON.parse(data);

				// Debug log: show which worker is accessing which servers
				if (process.env.E2E_SILENT_LOGS !== 'true') {
					debug &&
						console.log(
							`📋 Worker ${workerInfo.workerIndex} loaded ${servers.length} server configs from ${filename}`
						);
					debug && console.log(`   Available backend indices: 0-${servers.length - 1}`);
				}

				await use(servers);
			} catch {
				throw new Error('Port file not found, filename=' + filename);
			}
		},
		{ scope: 'worker' },
	],

	// Override baseURL to read from file AFTER webServer starts
	// This fixes timing issue where config loads before webServer writes port file
	// Uses RUN_ID to avoid conflicts between parallel runs
	baseURL: async ({}, use) => {
		const runId = process.env.RUN_ID || 'default';
		const filename = path.resolve(tempFolder, `.webapp-port-${runId}.json`);
		try {
			const data = readFileSync(filename, 'utf-8');
			const port = JSON.parse(data).port;
			const url = `http://localhost:${port}`;
			debug && console.log(`🎯 [Fixture] Using webapp URL: ${url} (RUN_ID: ${runId})`);
			await use(url);
		} catch {
			throw new Error('Port file not found, filename=' + filename);
			// // Fallback if file doesn't exist (shouldn't happen after webServer starts)
			// const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
			// const port = 5050 + (workspaceId * 100);
			// const url = `http://localhost:${port}`;
			// console.log(`⚠️  [Fixture] Webapp port file not found, using fallback: ${url}`);
			// await use(url);
		}
	},

	page: async ({ page, servers }, use, testInfo) => {
		// servers comes from worker-scoped fixture (read once per worker)
		const workerIndex = testInfo.parallelIndex;
		const projectName = testInfo.project.name;

		// console.log(`🔧 Worker ${workerIndex} (project: ${projectName}) requesting backend...`);

		if (servers.length === 0) {
			throw new Error(
				`❌ FATAL: No backend servers available!\n` + `   This should never happen. Check globalSetup.`
			);
		}

		// Use modulo to wrap worker indices and share backends across projects
		// This allows workers from multiple projects to reuse the same backend servers
		// Safe because each backend uses in-memory DB with test isolation
		const backendIndex = workerIndex % servers.length;
		const backendPort = servers[backendIndex].port;

		debug && console.log(`   ✅ Assigned backend #${backendIndex} (port ${backendPort})`);

		// Store backend port in page context for use by helper functions
		(page as any).backendPort = backendPort;

		// DEFENSE-IN-DEPTH: Verify workspace ID before running tests
		await verifyWorkspaceId(backendPort);

		const silentLogs = process.env.E2E_SILENT_LOGS === 'true';

		// Capture browser console logs for debugging
		page.on('console', msg => {
			const text = msg.text();
			// // Only log our debug messages (with emoji prefixes)
			// if (text.includes('[STATE CHANGE]') || text.includes('[EDIT]') || text.includes('[SUBMIT]')) {
			//   console.log(`🖥️  BROWSER: ${text}`);
			// }
			if (!silentLogs) {
				console.log(`[Frontend:${backendPort}] ${text}`);
			}
		});
		page.on('pageerror', error => {
			if (!silentLogs) {
				console.log(`[Frontend:${backendPort}] ${error.message}`);
			}
		});

		// Redirect all API requests to the worker's dedicated backend
		// Intercepts the E2E placeholder URL and redirects to the worker's backend port
		// If redirection fails, tests will fail loudly with "e2e-backend-placeholder not found"
		await page.route('*://e2e-backend-placeholder:9999/**', route => {
			const url = route.request().url();
			// Replace placeholder with localhost and correct port
			const newUrl = url.replace('e2e-backend-placeholder:9999', `localhost:${backendPort}`);
			route.continue({ url: newUrl });
		});

		// Use the page
		await use(page);
	},
});

export { expect } from '@playwright/test';
