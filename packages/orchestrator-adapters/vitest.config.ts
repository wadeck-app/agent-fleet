import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['**/*.test.ts', '**/*.config.ts', '**/dist/**', '**/__mocks__/**'],
		},
	},
	resolve: {
		alias: {
			'@app/shared-orch-backend': path.resolve(__dirname, '../shared-orch-backend/src'),
			'shared-common': path.resolve(__dirname, '../shared-common/src'),
		},
	},
});
