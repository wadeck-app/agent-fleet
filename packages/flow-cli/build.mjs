import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Clean dist/ to remove stale artifacts from prior tsc runs
fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });

const shared = {
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'esm',
	sourcemap: true,
	external: ['ws', '@wadeck/singleton-daemon-kit', 'js-yaml'],
};

// CLI entry points
await esbuild.build({
	...shared,
	entryPoints: {
		'cli/FlowIndex': path.join(__dirname, 'src/cli/FlowIndex.ts'),
		'cli/TaskIndex': path.join(__dirname, 'src/cli/TaskIndex.ts'),
	},
	outdir: path.join(__dirname, 'dist'),
});

// Worker entry point — must be standalone, all imports resolved inline
await esbuild.build({
	...shared,
	entryPoints: {
		'worker/Worker': path.join(__dirname, 'src/worker/Worker.ts'),
	},
	outdir: path.join(__dirname, 'dist'),
});

console.log('Build complete');
