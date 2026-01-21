// @ts-ignore
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Use node environment for backend tests
		environment: 'node',

		// Include test files
		include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],

		// Exclude patterns
		exclude: ['node_modules', 'dist', 'e2e'],

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			exclude: [
				'node_modules/',
				'dist/',
				'**/*.test.ts',
				'**/*.spec.ts',
				// Configuration files
				'*.config',
				'*.config.mjs',
				'*.config.ts',
				'**/*.config',
				'**/*.config.mjs',
				'**/*.config.ts',
				// Entry points and simple exports (tested via e2e)
				'src/server.ts',
				'src/routes.ts',
				'**/index.ts',
				// Fastify plugins and hooks (tested via integration/e2e)
				'src/fastify/plugins/**',
				'src/fastify/hooks/**',
				// Utilities that are wrappers or infrastructure
				'src/utils/fastify-wrapper.ts',
				'src/utils/logger.ts',
				'src/utils/apiStats.ts',
				'src/utils/lazy-controller-plugin.ts',
				'src/utils/internal-router.ts',
				'src/utils/controller-registry.ts',
				'src/utils/factory-instance.ts',
				// Type definitions only
				'src/storage/DataStorage.ts',
				'src/storage/QueryBuilder.ts',
			],
			// Thresholds - fail if coverage is below these values
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},

		// Test timeout (30 seconds)
		testTimeout: 30000,

		// Globals (allow describe, it, expect without imports)
		globals: true,

		// Clear mocks between tests
		clearMocks: true,

		// Reset mocks between tests
		mockReset: true,

		// Restore mocks after each test
		restoreMocks: true,
	},

	resolve: {
		alias: {
			'@app/shared': path.resolve(__dirname, '../shared-frontend-backend/src'),
			'shared-common': path.resolve(__dirname, '../shared-common/src'),
			'shared-orch-worker': path.resolve(__dirname, '../shared-orch-worker/src'),
			orchestrator: path.resolve(__dirname, '../orchestrator/src'),
			'flow-engine': path.resolve(__dirname, '../flow-engine/src'),
			'test-utils': path.resolve(__dirname, '../test-utils/src'),
			'@': path.resolve(__dirname, './src'),
		},
	},
});
