#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the orchestrator source
const orchestratorPath = path.join(__dirname, '..', 'src', 'orchestrator', 'core', 'index.ts');

// Check if we're disabling watch mode (watch is enabled by default)
const noWatchMode = process.argv.includes('--no-watch');

// Use tsx to run the TypeScript file
const args = noWatchMode
  ? [orchestratorPath]
  : ['watch', orchestratorPath];

const child = spawn('tsx', args, {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
