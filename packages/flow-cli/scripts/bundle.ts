/**
 * Bundles the flow CLI into a single CommonJS file.
 * Output: dist-bundle/flow.cjs
 * Usage:  npx tsx scripts/bundle.ts
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
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
	plugins: [{
		name: 'inline-extension-points',
		setup(pluginBuild) {
			pluginBuild.onResolve({ filter: /extension-points\/extension-points\.json$/ }, (args) => {
				const resolved = path.resolve(root, 'node_modules', 'extension-points', 'extension-points.json');
				return { path: resolved };
			});
		},
	}],
	logLevel: 'warning',
});

console.log('Bundle written to dist-bundle/flow.cjs');
