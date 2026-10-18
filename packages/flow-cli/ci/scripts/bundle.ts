/**
 * Bundles the flow CLI, its worker, and the auto-updater into standalone CommonJS files.
 * Outputs: dist-bundle/flow.cjs, dist-bundle/worker.cjs, dist-bundle/flow-updater.cjs, dist-bundle/app-module/
 * Usage:   npx tsx ci/scripts/bundle.ts
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

const MAX_UPDATER_SIZE = 500 * 1024; // 500 KB

const version = process.env['BUNDLE_VERSION'];
if (!version) {
	process.stderr.write('[bundle] ERROR: BUNDLE_VERSION env var not set -- refusing to build without a version\n');
	process.exit(1);
}

const sharedDefine = {
	'import.meta.url': '__importMetaUrl',
	__FLOW_CLI_VERSION__: JSON.stringify(version),
};
const sharedBanner = { js: `const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;` };

// Inline extension-points/extension-points.json so PluginLoader works in standalone installs.
// createRequire-based requires are not traced by esbuild; this plugin resolves them explicitly.
const inlineExtensionPoints = {
	name: 'inline-extension-points',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setup(pluginBuild: any) {
		pluginBuild.onResolve({ filter: /extension-points\/extension-points\.json$/ }, () => {
			// Use require.resolve to follow Node.js module resolution (handles workspace hoisting).
			const require = createRequire(import.meta.url);
			return { path: require.resolve('extension-points/extension-points.json') };
		});
	},
};

const updaterOutfile = path.join(root, 'dist-bundle/flow-updater.cjs');

await Promise.all([
	build({
		entryPoints: [path.join(root, 'dist/cli/FlowIndex.js')],
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		outfile: path.join(root, 'dist-bundle/flow.cjs'),
		external: [],
		supported: { 'top-level-await': false },
		define: sharedDefine,
		banner: sharedBanner,
		plugins: [inlineExtensionPoints],
		logLevel: 'warning',
	}),
	build({
		entryPoints: [path.join(root, 'dist/worker/Worker.js')],
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		outfile: path.join(root, 'dist-bundle/worker.cjs'),
		external: [],
		supported: { 'top-level-await': false },
		define: sharedDefine,
		banner: sharedBanner,
		plugins: [inlineExtensionPoints],
		logLevel: 'warning',
	}),
	build({
		entryPoints: [path.join(root, 'dist/updater/entry.js')],
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		outfile: updaterOutfile,
		// No externals -- all dependencies must be inlined
		external: [],
		// top-level await in ESM -> wrapped in async IIFE for CJS
		supported: { 'top-level-await': false },
		define: sharedDefine,
		banner: sharedBanner,
		logLevel: 'warning',
	}),
]);

// The app-module is built by its own package: `npm run bundle` there runs `app-core-cli package` (backend bundle,
// JSON views, packaged manifest stamped with this build's version). The CLI only copies the resulting dist-module/
// next to flow.cjs, where the daemon looks for it (see src/daemon/AppModuleLocator.ts).
const appModuleDir = path.join(root, '../app-module-flow');
const appModuleOutDir = path.join(root, 'dist-bundle/app-module');
execSync('npm run bundle', {
	cwd: appModuleDir,
	env: { ...process.env, BUNDLE_VERSION: version },
	stdio: 'inherit',
	windowsHide: true,
});
const packagedModule = path.join(appModuleDir, 'dist-module');
if (!existsSync(path.join(packagedModule, 'manifest.json'))) {
	throw new Error(
		`app-module-flow produced no ${packagedModule}/manifest.json: run "npm run bundle" in packages/app-module-flow and read its output.`
	);
}
rmSync(appModuleOutDir, { recursive: true, force: true });
cpSync(packagedModule, appModuleOutDir, { recursive: true });

const updaterSize = statSync(updaterOutfile).size;
if (updaterSize > MAX_UPDATER_SIZE) {
	throw new Error(
		`flow-updater.cjs is ${updaterSize} bytes (${(updaterSize / 1024).toFixed(1)} KB) -- exceeds 500 KB limit.\n` +
			'The flow runtime may have been accidentally included. Check UpdaterMain.ts imports.'
	);
}

console.log(
	`Bundled flow.cjs + worker.cjs + flow-updater.cjs (${(updaterSize / 1024).toFixed(1)} KB) -- version: ${version}`
);
