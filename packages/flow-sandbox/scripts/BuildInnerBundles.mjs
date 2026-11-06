#!/usr/bin/env node

/**
 * Builds the three files of /opt/flow for the sandbox image (written to image/opt-flow/, untracked build output):
 *   worker.cjs        the flow worker bundle: the same esbuild options as the `worker` entry of
 *                     packages/flow-cli/ci/scripts/bundle.ts, built from src/worker/Worker.ts
 *   mcp-server.cjs    copied from packages/flow-cli/src/worker/mcp-server.cjs (the worker looks for it next to itself)
 *   inner-bridge.cjs  the VM-side shim of the harness (src/harness/inner/InnerBridgeMain.ts)
 *
 * Why not `npm run bundle` of flow-cli: that script also builds flow.cjs, the updater and the two app modules (it
 * runs `npm run bundle` in other packages and writes into their folders), none of which the image needs, and it
 * starts from the compiled `dist/` of flow-cli, which may be stale. Keep the esbuild options below equal to the
 * `worker` entry of bundle.ts: a difference would mean the image runs another worker than the one flow ships.
 *
 * Usage (repository root): node --import tsx packages/flow-sandbox/scripts/BuildInnerBundles.mjs
 * Env: BUNDLE_VERSION  version stamped into the worker (default 0.0.0-sandbox-harness).
 */
import { build } from 'esbuild';
import { copyFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, '..');
const flowCli = path.join(packageRoot, '..', 'flow-cli');
const outDirectory = path.join(packageRoot, 'image', 'opt-flow');
const version = process.env.BUNDLE_VERSION ?? '0.0.0-sandbox-harness';

// Copied from bundle.ts: createRequire-based requires are not traced by esbuild.
const inlineExtensionPoints = {
	name: 'inline-extension-points',
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /extension-points\/extension-points\.json$/ }, () => {
			const require = createRequire(import.meta.url);
			return { path: require.resolve('extension-points/extension-points.json') };
		});
	},
};

const sharedDefine = {
	'import.meta.url': '__importMetaUrl',
	__FLOW_CLI_VERSION__: JSON.stringify(version),
};
const sharedBanner = { js: `const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;` };
const common = {
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'cjs',
	external: [],
	supported: { 'top-level-await': false },
	define: sharedDefine,
	banner: sharedBanner,
	logLevel: 'warning',
};

await Promise.all([
	build({
		...common,
		entryPoints: [path.join(flowCli, 'src', 'worker', 'Worker.ts')],
		outfile: path.join(outDirectory, 'worker.cjs'),
		plugins: [inlineExtensionPoints],
	}),
	build({
		...common,
		entryPoints: [path.join(packageRoot, 'src', 'harness', 'inner', 'InnerBridgeMain.ts')],
		outfile: path.join(outDirectory, 'inner-bridge.cjs'),
	}),
]);
copyFileSync(path.join(flowCli, 'src', 'worker', 'mcp-server.cjs'), path.join(outDirectory, 'mcp-server.cjs'));

for (const file of ['worker.cjs', 'mcp-server.cjs', 'inner-bridge.cjs']) {
	const size = statSync(path.join(outDirectory, file)).size;
	console.log(`${file}: ${(size / 1024).toFixed(0)} KB`);
}
console.log(`worker version stamp: ${version}`);
