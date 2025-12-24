import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Use node environment for shared package tests
		environment: 'node',

		// Include test files
		include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],

		// Exclude patterns
		exclude: ['node_modules', 'dist', '**/*.d.ts', '**/*', '**/*.js.map'],

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			exclude: [
				'node_modules/',
				'dist/',
				'**/*.test.ts',
				'**/*.spec.ts',
				'**/*.d.ts',
				'**/*',
				'**/*.js.map',
				// Configuration files
				'*.config.ts',
				'**/*.config.ts',
				// Entry points (tested via integration)
				'**/index.ts',
				// Docs
				'docs/**',
			],
			// Thresholds - fail if coverage is below these values
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},

		// Test timeout (10 seconds for shared code)
		testTimeout: 10000,

		// Globals (allow describe, it, expect without imports)
		globals: true,

		// Clear mocks between tests
		clearMocks: true,

		// Reset mocks between tests
		mockReset: true,

		// Restore mocks after each test
		restoreMocks: true,
	},
});
