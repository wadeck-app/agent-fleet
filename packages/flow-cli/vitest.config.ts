import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type Plugin, defineConfig } from 'vitest/config';

// Resolve .js imports to .ts source files during testing (ESM -> TypeScript)
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
		__FLOW_CLI_VERSION__: '"2026.01.01-000000-0-TEST0000"',
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		mockReset: true,
		restoreMocks: true,
		// Daemons started by tests register the "flow" module with app-core on every start. Without this they
		// would reach a REAL app-core on the developer's machine (port 4850, or the port it wrote in
		// server.port.json) or write its ~/.config/app-core/modules/flow.json pointing at a test bundle. Port 1 is
		// never listening, so registration falls back to a pickup file inside a throwaway directory.
		env: {
			APP_CORE_PORT: '1',
			APP_CORE_CONFIG_DIR: path.join(os.tmpdir(), 'flow-cli-tests-app-core'),
		},
		server: {
			deps: {
				// Inline @wadeck-app/shared-cli so vi.mock('node:child_process') penetrates it
				inline: ['@wadeck-app/shared-cli'],
			},
		},
	},
	resolve: {
		alias: {
			'shared-cli': path.resolve(__dirname, '../shared-cli/src'),
			'flow-core': path.resolve(__dirname, '../flow-core/src/index.ts'),
			'flow-engine': path.resolve(__dirname, '../flow-engine/src'),
			'shared-common': path.resolve(__dirname, '../shared-common/src'),
		},
		extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
	},
	esbuild: {
		target: 'es2022',
	},
});
