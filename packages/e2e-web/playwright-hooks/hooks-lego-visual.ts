import { test as base } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../../..');
const tempFolder = path.resolve(projectRoot, 'packages/e2e-web/temp');

function readPort(): number {
	const runId = process.env.RUN_ID || 'default';
	const filename = path.resolve(tempFolder, `.webapp-port-${runId}.json`);
	try {
		const data = readFileSync(filename, 'utf-8');
		return JSON.parse(data).port as number;
	} catch {
		throw new Error('Webapp port file not found: ' + filename);
	}
}

interface TestFixtures {
	baseURL: string;
	serverPort: number;
}

export const test = base.extend<TestFixtures>({
	baseURL: async ({}, use) => {
		const port = readPort();
		await use(`http://localhost:${port}`);
	},

	serverPort: async ({}, use) => {
		const port = readPort();
		await use(port);
	},

	page: async ({ page }, use) => {
		// Capture browser console and JS errors for debugging
		page.on('console', msg => {
			if (msg.type() === 'error') {
				console.log(`[Browser:error] ${msg.text()}`);
			}
		});
		page.on('pageerror', error => {
			console.log(`[Browser:pageerror] ${String(error)}`);
		});
		await use(page);
	},
});

export { expect } from '@playwright/test';
