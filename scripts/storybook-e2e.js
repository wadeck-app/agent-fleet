#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.STORYBOOK_E2E_PORT || '6100';
const isWindows = process.platform === 'win32';

const command = `npx storybook dev -p ${port}`;
// violations-suppress: cli/no-spawn-without-windows-hide stdio:'inherit' long-running storybook dev server - windowsHide strips the console handle and its vite/esbuild children would open visible consoles (see commit d032e7e)
const storybook = spawn(command, {
	cwd: path.resolve(__dirname, '../packages/web-frontend'),
	stdio: 'inherit',
	shell: isWindows,
});

storybook.on('exit', code => {
	process.exit(code || 0);
});
