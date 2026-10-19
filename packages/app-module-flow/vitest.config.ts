import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Plugin, defineConfig } from 'vitest/config';

// Resolve relative .js imports to .ts sources (the plugin packages import their TypeScript through .js specifiers).
function resolveJsToTs(): Plugin {
	return {
		name: 'resolve-js-to-ts',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer || !source.startsWith('.')) {
				return null;
			}
			const tsPath = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
			return fs.existsSync(tsPath) ? tsPath : null;
		},
	};
}

export default defineConfig({
	plugins: [resolveJsToTs()],
	test: {
		globals: true,
		environment: 'node',
		restoreMocks: true,
		include: ['src/**/*.test.ts'],
		// The integration test starts a real app-core server and runs `app-core-cli package`.
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			// Specific entry first: a plain 'flow-core' key would also capture 'flow-core/testing'.
			'flow-core/testing': path.resolve(__dirname, '../flow-core/src/testing/index.ts'),
			'flow-core': path.resolve(__dirname, '../flow-core/src/index.ts'),
		},
	},
});
