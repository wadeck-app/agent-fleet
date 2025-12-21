#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.STORYBOOK_E2E_PORT || '6100';
const isWindows = process.platform === 'win32';

const command = `npx storybook dev -p ${port}`;
const storybook = spawn(command, {
	cwd: path.resolve(__dirname, '../packages/web-frontend'),
	stdio: 'inherit',
	shell: isWindows,
});

storybook.on('exit', code => {
	process.exit(code || 0);
});
