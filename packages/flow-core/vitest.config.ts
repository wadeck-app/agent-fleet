import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Plugin, defineConfig } from 'vitest/config';

// Resolve .js imports to .ts source files during testing (ESM -> TypeScript)
function resolveJsToTs(): Plugin {
	return {
		name: 'resolve-js-to-ts',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer || !source.startsWith('.')) {
				return null;
			}
			const tsPath = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
			if (fs.existsSync(tsPath)) {
				return tsPath;
			}
			return null;
		},
	};
}

export default defineConfig({
	plugins: [resolveJsToTs()],
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		mockReset: true,
		restoreMocks: true,
		coverage: { include: ['src/**/*.ts'], exclude: ['src/**/*.test.ts', 'src/index.ts'] },
	},
	resolve: {
		alias: {
			'flow-engine': path.resolve(import.meta.dirname, '../flow-engine/src'),
		},
	},
});
