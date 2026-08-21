import * as fs from 'fs';
import * as path from 'path';
import { type Plugin, defineConfig } from 'vitest/config';

// Resolve .js imports to .ts source files during testing (ESM → TypeScript)
function resolveJsToTs(): Plugin {
	return {
		name: 'resolve-js-to-ts',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer || !source.startsWith('.')) return null;
			const tsPath = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
			if (fs.existsSync(tsPath)) return tsPath;
			return null;
		},
	};
}

export default defineConfig({
	plugins: [resolveJsToTs()],
	// Replace the esbuild bundle-time constant so updater tests see a real version string.
	define: {
		__FLOW_CLI_VERSION__: '"1.0.0"',
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		mockReset: true, // implies clearMocks — no need to set both
		restoreMocks: true,
	},
	resolve: {
		alias: {
			'shared-cli': path.resolve(__dirname, '../shared-cli/src'),
			'flow-engine': path.resolve(__dirname, '../flow-engine/src'),
			'shared-common': path.resolve(__dirname, '../shared-common/src'),
		},
		extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
	},
	esbuild: {
		target: 'es2022',
	},
});
