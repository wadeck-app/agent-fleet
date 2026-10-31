// Integration test: real daemon, real forked worker (`npm run build` first), real bash.
// A 2-step flow where step 2 consumes the output of step 1 and a declared secret is printed: the stored
// record must hold the inputs and outputs of both steps, the secret only as its placeholder, and the caps.
import { FlowQueryService } from 'flow-core';
import type { ExecutionState } from 'flow-core';
import { createTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_IO_LIMITS } from '../storage/StepIoRecorder';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';

armLeakGuardBeforeAll();

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

// Built at runtime from parts: a literal would trip secret scanners (GitHub push protection).
const TOKEN = ['tk', '_Ab3xY9', 'Q7z', '+K/m=9'].join('');
const TOKEN_PREFIX = TOKEN.slice(0, 6);

const FLOW_YAML = `\
id: step-io-e2e
version: "1.0.0"
name: Step io e2e
description: Step 2 consumes the output of step 1; a declared secret is printed
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs:
  API_TOKEN:
    type: password
    required: true
  region:
    type: string
    required: true
steps:
  - id: produce
    name: Produce
    type: script
    shell: bash
    secrets: [API_TOKEN]
    env:
      REGION: "\${{ inputs.region }}"
    script: |
      echo "region=$REGION"
      echo "token=$API_TOKEN"
      yes zzzzzzzzz | head -c 6000
      echo "warn $API_TOKEN" >&2
  - id: consume
    name: Consume
    type: script
    shell: bash
    depends: [produce]
    env:
      PREV: "\${{ steps.produce.outputs.stdout }}"
    script: |
      echo "consumed \${#PREV} chars"
`;

describe('step input/output recording (end to end)', () => {
	let workDir: string;
	let registry: RegisteredProjectFixture;

	beforeAll(() => {
		if (!fs.existsSync(workerBinary)) {
			throw new Error(
				`Worker binary not found at ${workerBinary}: run 'npm run build' in packages/flow-cli first.`
			);
		}
	});

	beforeEach(async () => {
		// The in-process daemon resolves the project of each run from this process's registry.
		registry = new RegisteredProjectFixture().useAsProcessEnv();
		workDir = createTempDirectory('step-io-e2e-work-');
		await registry.register('step-io-e2e', { folder: workDir });
		fs.writeFileSync(path.join(workDir, 'flow.yml'), FLOW_YAML, 'utf8');
		// The daemon runs in this process: env:// is read from this environment.
		process.env['STEP_IO_E2E_TOKEN'] = TOKEN;
	});

	afterEach(() => {
		registry.dispose();
		delete process.env['STEP_IO_E2E_TOKEN'];
	});

	it('stores what both steps received and produced, the secret only as its placeholder, within the caps', async () => {
		if (!requireBashOrSkip('StepIoRecording')) return;
		await using ctx = await startTestDaemon();

		const response = await ctx.client.send('run', {
			type: 'run',
			flowFile: path.join(workDir, 'flow.yml'),
			cwd: workDir,
			inputs: { API_TOKEN: 'env://STEP_IO_E2E_TOKEN', region: 'eu' },
		});
		if (response.type !== 'execution_started') {
			throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
		}
		const { executionId } = response;
		const finalState = await waitForExecution(ctx.daemonDir, executionId, 60000);
		expect(finalState.status, finalState.lastError).toBe('completed');

		const recordPath = path.join(ctx.daemonDir, 'executions', `${executionId}.json`);
		const recordText = fs.readFileSync(recordPath, 'utf8');
		const record = JSON.parse(recordText) as ExecutionState;

		// The secret is never stored, not even a prefix of it cut by a cap.
		expect(recordText).not.toContain(TOKEN);
		expect(recordText).not.toContain(TOKEN_PREFIX);

		const produce = record.steps['produce']!.io!;
		expect(produce.inputs['inputs.region']?.text).toBe('eu');
		expect(produce.inputs['env.REGION']?.text).toBe('eu');
		expect(produce.inputs['secrets.API_TOKEN']?.text).toBe('[secret:API_TOKEN]');
		expect(produce.stderr?.text).toContain('warn [secret:API_TOKEN]');
		// The output step 2 consumes: cut at the per-value cap, with the original length kept.
		const result = produce.outputs['stdout']!;
		expect(result.text.startsWith('region=eu\ntoken=[secret:API_TOKEN]\n')).toBe(true);
		expect(result.truncated).toBe(true);
		expect(result.chars).toBeGreaterThan(DEFAULT_IO_LIMITS.perValue);
		expect(result.text).toHaveLength(DEFAULT_IO_LIMITS.perValue);
		expect(produce.stdout?.truncated).toBe(true);
		expect(produce.truncated).toBe(true);

		const consume = record.steps['consume']!.io!;
		const received = consume.inputs['env.PREV']!;
		expect(received.text.startsWith('region=eu\ntoken=[secret:API_TOKEN]\n')).toBe(true);
		expect(received.chars).toBeGreaterThan(DEFAULT_IO_LIMITS.perValue);
		expect(consume.stdout?.text.trim()).toMatch(/^consumed \d+ chars$/);
		expect(Object.keys(consume.outputs).sort()).toEqual(['exitCode', 'rawOutput', 'stderr', 'stdout', 'success']);

		let total = 0;
		for (const step of Object.values(record.steps)) {
			expect(step.io!.storedChars).toBeLessThanOrEqual(DEFAULT_IO_LIMITS.perStep);
			total += step.io!.storedChars;
		}
		expect(total).toBeLessThanOrEqual(DEFAULT_IO_LIMITS.perExecution);

		const shown = FlowQueryService.forConfigDir(ctx.daemonDir).renderExecution(executionId, {
			tail: 2000,
			full: false,
			io: true,
		});
		expect(shown).toContain('env.REGION: eu');
		expect(shown).toContain('[secret:API_TOKEN]');
		expect(shown).not.toContain(TOKEN_PREFIX);
	}, 90000);
});
