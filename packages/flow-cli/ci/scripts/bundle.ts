/**
 * Bundles the flow CLI, its worker, and the auto-updater into standalone CommonJS files.
 * Outputs: dist-bundle/flow.cjs, dist-bundle/worker.cjs, dist-bundle/flow-updater.cjs
 * Usage:   npx tsx ci/scripts/bundle.ts
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

const MAX_UPDATER_SIZE = 500 * 1024; // 500 KB

function getCalVer(): string {
	const now = new Date();
	const pad2 = (n: number) => String(n).padStart(2, '0');
	const date = `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`;
	const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
	let count = '0';
	let hash = 'DEV';
	try { count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(); } catch { /* not a git repo */ }
	try { hash = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim(); } catch { /* not a git repo */ }
	return `${date}-${time}-${count}-${hash}`;
}
const version = process.env['BUNDLE_VERSION'] ?? getCalVer();

const sharedDefine = {
	'import.meta.url': '__importMetaUrl',
	__FLOW_CLI_VERSION__: JSON.stringify(version),
};
const sharedBanner = { js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;` };

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
		entryPoints: [path.join(root, 'dist/updater/UpdaterMain.js')],
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		outfile: updaterOutfile,
		// No externals -- all dependencies must be inlined
		external: [],
		// top-level await in ESM → wrapped in async IIFE for CJS
		supported: { 'top-level-await': false },
		define: sharedDefine,
		banner: sharedBanner,
		logLevel: 'warning',
	}),
]);

const updaterSize = statSync(updaterOutfile).size;
if (updaterSize > MAX_UPDATER_SIZE) {
	throw new Error(
		`flow-updater.cjs is ${updaterSize} bytes (${(updaterSize / 1024).toFixed(1)} KB) — exceeds 500 KB limit.\n` +
		'The flow runtime may have been accidentally included. Check UpdaterMain.ts imports.'
	);
}

console.log(`Bundled flow.cjs + worker.cjs + flow-updater.cjs (${(updaterSize / 1024).toFixed(1)} KB) — version: ${version}`);
