/**
 * Bundles the task CLI into a single CommonJS file.
 * Output: dist-bundle/task.cjs
 * Usage:  npx tsx scripts/bundle-task.ts
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as { version: string };

await build({
	entryPoints: [path.join(root, 'dist/cli/TaskIndex.js')],
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'cjs',
	outfile: path.join(root, 'dist-bundle/task.cjs'),
	external: [],
	supported: { 'top-level-await': false },
	define: {
		'import.meta.url': '__importMetaUrl',
		__TASK_CLI_VERSION__: JSON.stringify(version),
	},
	banner: {
		js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
	},
	logLevel: 'warning',
});

console.log('Bundle written to dist-bundle/task.cjs');
