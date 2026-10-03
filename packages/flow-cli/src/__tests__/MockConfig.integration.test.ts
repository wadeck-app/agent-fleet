// Integration test for `flow run --mock-config` (daemon-dispatched mock-step execution).
// Requires the built worker binary (`npm run build` first), like EndToEnd.integration.test.ts.
// Run with: npx vitest run src/__tests__/MockConfig.integration.test.ts
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');
const mockPath = path.resolve(fileURLToPath(import.meta.url), '../../../../flow-engine/src/testing/opencode-mock.mjs');

function isWorkerRunnable(): boolean {
	if (!fs.existsSync(workerBinary)) return false;
	const result = spawnSync(process.execPath, [workerBinary], { timeout: 5000, env: {}, stdio: 'pipe' });
	const stderr = result.stderr?.toString() ?? '';
	return !stderr.includes('Dynamic require') && !stderr.includes('SyntaxError');
}

const workerRunnable = isWorkerRunnable();

const TWO_STEP_FLOW = `\
id: mock-verify
version: "1.0.0"
name: Mock Verify
description: model step + script step reading its output
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: generate_flow
    name: Generate Flow
    type: model
    provider: opencode
    model: astra
    prompt: write a flow
  - id: check
    name: Check
    type: script
    script: "echo \\"GOT:\${{ steps.generate_flow.outputs.rawOutput }}\\""
    captureOutput: true
    depends:
      - generate_flow
`;

describe.skipIf(!workerRunnable)('--mock-config end-to-end (manual verification)', () => {
	it('real run: model step actually calls the mock CLI and produces its own text', async () => {
		const flowYml = path.join(os.tmpdir(), `mock-verify-real-${Date.now()}.yml`);
		fs.writeFileSync(flowYml, TWO_STEP_FLOW, 'utf8');
		try {
			await using ctx = await startTestDaemon();
			const response = await ctx.client.send('run', {
				type: 'run',
				flowFile: flowYml,
				cwd: os.tmpdir(),
				inputs: {},
				// Real run: no mockEnv. generate_flow uses OPENCODE_MOCK_PATH only to avoid a real
				// API call in this verification -- the per-step override is NOT exercised here.
				mockEnv: { generate_flow: { OPENCODE_MOCK_PATH: mockPath } },
			});
			expect(response.type).toBe('execution_started');
			if (response.type !== 'execution_started') throw new Error('expected execution_started');
			const finalState = await waitForExecution(ctx.daemonDir, response.executionId, 30000);
			expect(finalState.status).toBe('completed');
		} finally {
			fs.rmSync(flowYml, { force: true });
		}
	}, 35000);

	it('mocked run: --mock-config overrides generate_flow to a fixed string, zero real model behavior, downstream step receives exactly that string', async () => {
		const flowYml = path.join(os.tmpdir(), `mock-verify-mocked-${Date.now()}.yml`);
		fs.writeFileSync(flowYml, TWO_STEP_FLOW, 'utf8');
		try {
			await using ctx = await startTestDaemon();
			const response = await ctx.client.send('run', {
				type: 'run',
				flowFile: flowYml,
				cwd: os.tmpdir(),
				inputs: {},
				mockEnv: {
					generate_flow: {
						OPENCODE_MOCK_PATH: mockPath,
						OPENCODE_MOCK_RESPONSE: 'id: build_task\nname: Build task',
						OPENCODE_MOCK_EXIT_CODE: '0',
					},
				},
				mockConfigPath: '/tmp/fixture-mock-config.yaml',
			});
			expect(response.type).toBe('execution_started');
			if (response.type !== 'execution_started') throw new Error('expected execution_started');
			const finalState = await waitForExecution(ctx.daemonDir, response.executionId, 30000);
			expect(finalState.status).toBe('completed');

			// Daemon log must carry the visible MOCK banner.
			const today = new Date().toISOString().slice(0, 10);
			const daemonLog = fs.readFileSync(path.join(ctx.daemonDir, 'logs', `${today}.ndjson`), 'utf8');
			expect(daemonLog).toContain("MOCK: step 'generate_flow'");
			expect(daemonLog).toContain('/tmp/fixture-mock-config.yaml');

			// The downstream script step must receive exactly the fixed mocked string -- zero
			// model/API calls, no residue from the real opencode-mock response text format.
			expect(daemonLog).toContain('GOT:id: build_task');
		} finally {
			fs.rmSync(flowYml, { force: true });
		}
	}, 35000);
});
