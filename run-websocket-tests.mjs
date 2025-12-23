#!/usr/bin/env node
import { spawn } from 'child_process';

const proc = spawn('npm', ['run', 'test', '--workspace=orchestrator-adapters', '--', 'WebSocketTransport.test.ts'], {
	cwd: process.cwd(),
	stdio: 'inherit',
	shell: true,
});

proc.on('close', code => {
	process.exit(code);
});
