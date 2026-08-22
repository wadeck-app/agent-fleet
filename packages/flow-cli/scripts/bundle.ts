/**
 * Bundles the flow CLI and its worker into standalone CommonJS files.
 * Outputs: dist-bundle/flow.cjs, dist-bundle/worker.cjs
 * Usage:   npx tsx scripts/bundle.ts
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as { version: string };

await build({
	entryPoints: [path.join(root, 'dist/cli/FlowIndex.js')],
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'cjs',
	outfile: path.join(root, 'dist-bundle/flow.cjs'),
	external: [],
	supported: { 'top-level-await': false },
	define: {
		'import.meta.url': '__importMetaUrl',
		__FLOW_CLI_VERSION__: JSON.stringify(version),
	},
	banner: {
		js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
	},
	// Inline extension-points/extension-points.json so PluginLoader works in standalone installs.
	// createRequire-based requires are not traced by esbuild; this plugin resolves them explicitly.
	plugins: [
		{
			name: 'inline-extension-points',
			setup(pluginBuild) {
				pluginBuild.onResolve({ filter: /extension-points\/extension-points\.json$/ }, () => {
					// Use require.resolve to follow Node.js module resolution (handles workspace hoisting).
					const require = createRequire(import.meta.url);
					return { path: require.resolve('extension-points/extension-points.json') };
				});
			},
		},
	],
	logLevel: 'warning',
});

console.log('Bundle written to dist-bundle/flow.cjs');

// Bundle the worker as a separate self-contained CJS file so it runs without tsx or dist/.
await build({
	entryPoints: [path.join(root, 'dist/worker/Worker.js')],
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'cjs',
	outfile: path.join(root, 'dist-bundle/worker.cjs'),
	external: [],
	supported: { 'top-level-await': false },
	define: {
		'import.meta.url': '__importMetaUrl',
		__FLOW_CLI_VERSION__: JSON.stringify(version),
	},
	banner: {
		js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
	},
	plugins: [
		{
			name: 'inline-extension-points',
			setup(pluginBuild) {
				pluginBuild.onResolve({ filter: /extension-points\/extension-points\.json$/ }, () => {
					const require = createRequire(import.meta.url);
					return { path: require.resolve('extension-points/extension-points.json') };
				});
			},
		},
	],
	logLevel: 'warning',
});

console.log('Bundle written to dist-bundle/worker.cjs');
