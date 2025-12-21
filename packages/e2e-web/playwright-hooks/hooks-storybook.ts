/**
 * Storybook Test Hooks
 * Provides baseURL override to read dynamic port from file
 */
import { test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

interface TestFixtures {
	// Override baseURL dynamically from file
	baseURL: string;
}

const debug = false;

const projectRoot = path.resolve(__dirname, '../../..');
const tempFolder = path.resolve(projectRoot, 'packages/e2e-web/temp');

// Hook to read Storybook URL dynamically
export const test = base.extend<TestFixtures>({
	// Override baseURL to read from file AFTER webServer starts
	// This fixes timing issue where config loads before webServer writes port file
	// Uses RUN_ID to avoid conflicts between parallel runs
	baseURL: async ({}, use) => {
		const runId = process.env.RUN_ID || 'default';
		const filename = path.resolve(tempFolder, `.storybook-port-${runId}.json`);
		try {
			const data = readFileSync(filename, 'utf-8');
			const dataJson = JSON.parse(data);
			const port = dataJson.port;
			const url = `http://localhost:${port}`;
			debug && console.log(`🎯 [Storybook Fixture] Using Storybook URL: ${url} (RUN_ID: ${runId})`);
			await use(url);
		} catch {
			throw new Error('Port file not found, filename=' + filename);
			// // Fallback if file doesn't exist (shouldn't happen after webServer starts)
			// const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
			// const port = 6100 + (workspaceId * 1000);
			// const url = `http://localhost:${port}`;
			// console.log(`⚠️  [Storybook Fixture] Port file not found, using fallback: ${url}`);
			// await use(url);
		}
	},
});

export { expect } from '@playwright/test';
