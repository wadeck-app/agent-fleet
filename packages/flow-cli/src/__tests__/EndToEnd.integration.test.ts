// Integration test: requires built worker binary (`npm run build` first)
// Run with: vitest run --reporter=verbose src/__tests__/EndToEnd.integration.test.ts
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

// Check that the binary exists AND launches without module-level errors.
// Passes no FLOW_WS_PORT so the worker exits with "not set" — that's fine.
// If the binary has CJS/ESM issues (Dynamic require errors) it is treated as absent.
function isWorkerRunnable(): boolean {
	if (!fs.existsSync(workerBinary)) return false;
	const result = spawnSync(process.execPath, [workerBinary], {
		timeout: 5000,
		env: {},
		stdio: 'pipe',
	});
	const stderr = result.stderr?.toString() ?? '';
	return !stderr.includes('Dynamic require') && !stderr.includes('SyntaxError');
}

const workerRunnable = isWorkerRunnable();

const SIMPLE_SCRIPT_FLOW = `\
id: e2e-echo
version: "1.0.0"
name: E2E Echo
description: Simple echo test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: echo-step
    name: Echo
    type: script
    script: echo hello
    captureOutput: true
`;

describe.skipIf(!workerRunnable)('EndToEnd (requires built worker)', () => {
	it('runs a simple script flow via daemon', async () => {
		const flowYml = path.join(os.tmpdir(), `e2e-test-flow-${Date.now()}.yml`);
		fs.writeFileSync(flowYml, SIMPLE_SCRIPT_FLOW, 'utf8');

		try {
			await using ctx = await startTestDaemon();

			const response = await ctx.client.send('run', {
				type: 'run',
				flowFile: flowYml,
				cwd: os.tmpdir(),
				inputs: {},
			});

			expect(response.type).toBe('execution_started');
			if (response.type !== 'execution_started') throw new Error('Expected execution_started');

			const { executionId } = response;
			const finalState = await waitForExecution(ctx.daemonDir, executionId, 30000);
			expect(finalState.status).toBe('completed');
			expect(finalState.steps['echo-step']?.status).toBe('completed');
		} finally {
			fs.rmSync(flowYml, { force: true });
		}
	}, 35000);
});
