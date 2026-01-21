import * as fs from 'fs';
import * as path from 'path';
import { Plugin, defineConfig } from 'vitest/config';

// Plugin to resolve .js imports to .ts source files during testing
function resolveJsToTs(): Plugin {
	return {
		name: 'resolve-js-to-ts',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer || !source.endsWith('')) return null;
			if (source.startsWith('.') && importer) {
				const dir = path.dirname(importer);
				const tsPath = path.resolve(dir, source.replace(/\.js$/, '.ts'));
				if (fs.existsSync(tsPath)) {
					return tsPath;
				}
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
		exclude: ['**/node_modules/**', '**/dist/**', '**/dist-types/**'],
	},
	resolve: {
		alias: {
			'test-utils/index': path.resolve(__dirname, '../test-utils/src/index.ts'),
			'test-utils': path.resolve(__dirname, '../test-utils/src'),
			'shared-common': path.resolve(__dirname, '../shared-common/src'),
			'flow-engine': path.resolve(__dirname, '../flow-engine/src'),
			'shared-orch-worker': path.resolve(__dirname, '../shared-orch-worker/src'),
			'worker': path.resolve(__dirname, './src'),
		},
		extensions: ['.ts', '.tsx', '', '.jsx', '.json'],
	},
	esbuild: {
		target: 'es2022',
	},
});
