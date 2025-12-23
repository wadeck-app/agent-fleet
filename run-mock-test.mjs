#!/usr/bin/env node

/**
 * Quick script to run MockOrchestratorClient tests
 */
import { spawn } from 'child_process';

const proc = spawn(
	'npm',
	['run', 'test', '--workspace=orchestrator-adapters', '--', 'MockOrchestratorClient.test.ts'],
	{
		shell: true,
		cwd: process.cwd(),
		stdio: 'inherit',
	}
);

proc.on('close', code => {
	process.exit(code);
});
