import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');

export default defineConfig({
	testDir: path.resolve(projectRoot, 'packages/e2e-web/test-lego-visual'),
	outputDir: path.resolve(projectRoot, 'packages/e2e-web/test-lego-visual/_results/_misc'),
	timeout: 30_000,
	fullyParallel: false, // serial within describe blocks must be respected
	workers: 1, // single worker: avoids port/state race conditions
	retries: 0,
	reporter: [['html', { outputFolder: 'test-lego-visual/_results/html', open: 'on-failure' }], ['list']],
	use: {
		baseURL: `http://localhost:${process.env.LEGO_APP_PORT || 5310}`,
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
	},
	snapshotPathTemplate: '{testDir}/{testFilePath}--snapshots/{arg}-{projectName}{ext}',
	projects: [
		{
			name: 'lego-visual',
			testMatch: '**/*.visual.ts',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
			expect: {
				toHaveScreenshot: {
					maxDiffPixelRatio: 0.002,
					maxDiffPixels: 100,
					threshold: 0.2,
					animations: 'disabled',
				},
			},
		},
	],
	// Reuse the already-running dev server (dev-only, not CI)
	webServer: {
		command: 'echo "Dev server expected to be already running"',
		url: `http://localhost:${process.env.LEGO_APP_PORT || 5310}`,
		reuseExistingServer: true,
	},
});
