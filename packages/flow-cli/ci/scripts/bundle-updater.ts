/**
 * Bundles the auto-updater into a single CommonJS file.
 * Output: dist-bundle/flow-updater.cjs
 * Usage:  npx tsx ci/scripts/bundle-updater.ts
 *
 * Size guard: throws if output exceeds 500 KB (indicates flow runtime was accidentally included).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const outfile = path.join(root, 'dist-bundle/flow-updater.cjs');
const MAX_SIZE_BYTES = 500 * 1024; // 500 KB

const { version: pkgVersion } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as { version: string };
const version = process.env['BUNDLE_VERSION'] ?? pkgVersion;

await build({
	entryPoints: [path.join(root, 'dist/updater/UpdaterMain.js')],
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'cjs',
	outfile,
	// No externals -- all dependencies must be inlined
	external: [],
	// top-level await in ESM → wrapped in async IIFE for CJS
	supported: { 'top-level-await': false },
	// Replace import.meta.url with the CJS equivalent (__filename)
	define: {
		'import.meta.url': '__importMetaUrl',
		__FLOW_CLI_VERSION__: JSON.stringify(version),
	},
	banner: {
		js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
	},
	logLevel: 'warning',
});

const { size } = fs.statSync(outfile);
if (size > MAX_SIZE_BYTES) {
	throw new Error(
		`flow-updater.cjs is ${size} bytes (${(size / 1024).toFixed(1)} KB) — exceeds 500 KB limit.\n` +
			'The flow runtime may have been accidentally included. Check UpdaterMain.ts imports.'
	);
}

console.log(`Bundle written to dist-bundle/flow-updater.cjs (${(size / 1024).toFixed(1)} KB)`);
