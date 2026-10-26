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

// These files execute dist-bundle/, built once by the globalSetup of the `bundling` project (a rebuild per file
// rewrote dist/ and deleted bundles under the other file and under the unit tests).
const BUNDLING_TESTS = [
	'src/__tests__/CliSmoke.integration.test.ts',
	'src/__tests__/DaemonSingleton.integration.test.ts',
	'src/__tests__/DaemonShutdown.integration.test.ts',
	'src/__tests__/BundledDaemonQueueIsolation.integration.test.ts',
	'src/__tests__/RunAfterIdleStop.integration.test.ts',
	'src/__tests__/DaemonStartFailure.integration.test.ts',
	'src/cli/FlowIndex.integration.test.ts',
];

export default defineConfig({
	plugins: [resolveJsToTs()],
	// Replace the esbuild bundle-time constant so updater tests see a real CalVer release version (a
	// non-CalVer one makes the dev-build guard refuse every update, see @wadeck-app/shared-cli/ReleaseVersion).
	define: {
		__FLOW_CLI_VERSION__: '"2026.01.01-001-0123abcd"',
	},
	test: {
		globals: true,
		environment: 'node',
		// include/exclude live in the projects: an include set here would be merged into the bundling project.
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					exclude: ['**/node_modules/**', '**/dist/**', ...BUNDLING_TESTS],
				},
			},
			{
				extends: true,
				test: {
					name: 'bundling',
					include: BUNDLING_TESTS,
					globalSetup: ['src/test-utils/BundleGlobalSetup.ts'],
				},
			},
		],
		// RegistrySafetyNet: every test file gets a throwaway XDG_CONFIG_HOME, so the project registry (and flow's config
		// dir) of the real machine is unreachable.
		// ProcessLeakSetup: fails a file that started a flow daemon/worker/CLI and left it running (see ProcessLeakGuard).
		// Files that never arm the guard are not affected.
		setupFiles: ['src/test-utils/RegistrySafetyNet.setup.ts', 'src/test-utils/ProcessLeakSetup.ts'],
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
			// Specific entries first: a plain 'flow-core' key would also capture 'flow-core/testing'.
			'flow-core/testing': path.resolve(__dirname, '../flow-core/src/testing/index.ts'),
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
