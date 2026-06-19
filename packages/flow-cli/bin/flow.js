#!/usr/bin/env node
// Resolve tsx and cli.ts relative to this file so the binary works globally via npm link
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const tsx = resolve(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cli = resolve(__dirname, '..', 'src', 'cli.ts');

const child = spawn(process.execPath, [tsx, cli, ...process.argv.slice(2)], {
	stdio: 'inherit',
});
child.on('exit', code => process.exit(code ?? 0));
