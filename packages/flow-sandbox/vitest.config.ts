import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		// A sequence against the sbx mock is a dozen child processes, and a busy machine makes each of them slow: the
		// 5 s default failed a correct test. This is a bound for a hang, not a wait; the tests that look for a hang
		// carry their own short limits (execTimeoutMs, timeoutMs).
		testTimeout: 30_000,
		coverage: {
			provider: 'v8',
			reporter: ['text'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
		},
	},
	resolve: {
		alias: {
			// Same mapping as `paths` in tsconfig.shared.json: the exec variant tests run the engine's real McpServer.
			'flow-cli': fileURLToPath(new URL('../flow-cli/src', import.meta.url)),
		},
	},
});
