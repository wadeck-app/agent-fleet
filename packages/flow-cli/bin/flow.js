#!/usr/bin/env node
// Resolve tsx and FlowIndex.ts relative to this file so the binary works globally via npm link
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, '..');
const cli = resolve(__dirname, '..', 'src', 'cli', 'FlowIndex.ts');

// Locate tsx via require.resolve starting from the package dir (handles workspace hoisting)
const require = createRequire(join(packageDir, 'package.json'));
let tsx;
try {
	tsx = require.resolve('tsx/dist/cli.mjs');
} catch {
	// Fallback: scan upward for tsx in node_modules (monorepo root)
	let dir = packageDir;
	for (let i = 0; i < 4; i++) {
		const candidate = resolve(dir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
		if (existsSync(candidate)) {
			tsx = candidate;
			break;
		}
		dir = resolve(dir, '..');
	}
}
if (!tsx) {
	console.error('flow: cannot locate tsx — run npm install in the monorepo root');
	process.exit(1);
}

const child = spawn(process.execPath, [tsx, cli, ...process.argv.slice(2)], {
	stdio: 'inherit',
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
