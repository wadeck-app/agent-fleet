#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the CLI entry point
const cliPath = path.join(__dirname, '..', 'src', 'cli', 'entry-point.ts');

// Pass all arguments to the CLI
const args = process.argv.slice(2);

const child = spawn('tsx', [cliPath, ...args], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
