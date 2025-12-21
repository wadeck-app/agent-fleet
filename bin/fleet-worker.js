#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the flow worker source
const workerPath = path.join(__dirname, '..', 'src', 'workers', 'flow', 'flow-worker.ts');

// Parse arguments
const args = process.argv.slice(2);
const noWatchMode = args.includes('--no-watch');

// Filter out --no-watch from args to pass to the worker
const workerArgs = args.filter(arg => arg !== '--no-watch');

// Use tsx to run the TypeScript file (watch mode is enabled by default)
const tsxArgs = noWatchMode ? [workerPath, ...workerArgs] : ['watch', workerPath, ...workerArgs];

const child = spawn('tsx', tsxArgs, {
	stdio: 'inherit',
	shell: true,
	cwd: process.cwd(), // Use current working directory
});

child.on('exit', code => {
	process.exit(code || 0);
});
