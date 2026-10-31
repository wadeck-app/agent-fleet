// Integration test: real daemon, real forked worker (`npm run build` first), real bash, and a recording
// publisher in place of the queue. Proves the events a real run produces, and that none leaks a secret.
import { logsDirOf } from 'flow-core';
import { createTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RecordingFlowEventPublisher } from '../test-utils/RecordingFlowEventPublisher';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { requireBashOrSkip, startTestDaemon, waitForExecution } from '../test-utils/TestHelpers';
import { armLeakGuardBeforeAll } from '../test-utils/LeakGuardHooks';

armLeakGuardBeforeAll();

const workerBinary = path.resolve(fileURLToPath(import.meta.url), '../../../dist/worker/Worker.js');

// Built at runtime from parts: a literal would trip secret scanners (GitHub push protection).
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');

function flowYaml(id: string, stepScript: string, withSecret: boolean): string {
	return `\
id: ${id}
version: "1.0.0"
name: ${id}
description: Lifecycle events end to end
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
${withSecret ? 'inputs:\n  API_TOKEN:\n    type: password\n    required: true\n' : ''}steps:
  - id: only
    name: Only step
    type: script
    shell: bash
${withSecret ? '    secrets: [API_TOKEN]\n' : ''}    script: |
${stepScript
	.split('\n')
	.map(line => `      ${line}`)
	.join('\n')}
`;
}

describe('flow lifecycle events (end to end)', () => {
	let workDir: string;
	let publisher: RecordingFlowEventPublisher;
	let registry: RegisteredProjectFixture;
	let projectId: string;

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
		workDir = createTempDirectory('flow-events-e2e-');
		projectId = (await registry.register('flow-events-e2e', { folder: workDir })).id;
		publisher = new RecordingFlowEventPublisher();
		process.env['FLOW_EVENTS_E2E_TOKEN'] = TOKEN;
	});

	afterEach(() => {
		registry.dispose();
		delete process.env['FLOW_EVENTS_E2E_TOKEN'];
	});

	async function run(
		ctx: Awaited<ReturnType<typeof startTestDaemon>>,
		yaml: string,
		inputs: Record<string, string> = {}
	): Promise<string> {
		const flowFile = path.join(workDir, 'flow.yml');
		fs.writeFileSync(flowFile, yaml, 'utf8');
		const response = await ctx.client.send('run', { type: 'run', flowFile, cwd: workDir, inputs });
		if (response.type !== 'execution_started') {
			throw new Error(`Expected execution_started, got ${JSON.stringify(response)}`);
		}
		return response.executionId;
	}

	it('publishes started and completed events for a successful run, once each, with the project', async () => {
		if (!requireBashOrSkip('FlowEvents')) return;
		await using ctx = await startTestDaemon({ eventPublisher: publisher });

		const executionId = await run(ctx, flowYaml('events-ok', 'echo ok', false));
		const finalState = await waitForExecution(ctx.daemonDir, executionId, 60000);
		expect(finalState.status).toBe('completed');

		expect(publisher.names()).toEqual([
			'flow.execution.started',
			'flow.step.started',
			'flow.step.completed',
			'flow.execution.completed',
		]);
		for (const { payload } of publisher.events) {
			expect(payload).toMatchObject({ executionId, flowId: 'events-ok', projectId });
			expect(fs.realpathSync(payload.projectRoot!)).toBe(fs.realpathSync(workDir));
		}
		expect(publisher.events[2]!.payload).toMatchObject({ stepId: 'only', status: 'completed', attempt: 1 });
		expect(publisher.events[3]!.payload.status).toBe('completed');
	}, 90000);

	it('publishes failed events for a failing run and never hands a declared secret to the publisher', async () => {
		if (!requireBashOrSkip('FlowEvents')) return;
		await using ctx = await startTestDaemon({ eventPublisher: publisher });

		const executionId = await run(ctx, flowYaml('events-fail', 'echo "bad: $API_TOKEN" >&2\nexit 1', true), {
			API_TOKEN: 'env://FLOW_EVENTS_E2E_TOKEN',
		});
		const finalState = await waitForExecution(ctx.daemonDir, executionId, 60000);
		expect(finalState.status).toBe('failed');

		expect(publisher.names()).toEqual([
			'flow.execution.started',
			'flow.step.started',
			'flow.step.failed',
			'flow.execution.failed',
		]);
		expect(publisher.events[2]!.payload).toMatchObject({ stepId: 'only', status: 'failed', attempt: 1 });
		expect(typeof publisher.events[2]!.payload.error).toBe('string');
		expect(JSON.stringify(publisher.events)).not.toContain(TOKEN);
	}, 90000);

	it('logs one status line at start and flushes the publisher when the daemon stops', async () => {
		const ctx = await startTestDaemon({ eventPublisher: publisher });
		const logText = await vi.waitFor(
			() => {
				const dir = logsDirOf(ctx.daemonDir);
				const text = fs
					.readdirSync(dir)
					.map(file => fs.readFileSync(path.join(dir, file), 'utf8'))
					.join('\n');
				expect(text).toContain('Queue events: enabled');
				return text;
			},
			{ timeout: 5000, interval: 25 }
		);
		expect(logText.match(/Queue events: /g)).toHaveLength(1);
		expect(logText).toContain('declared to the queue (6 events');
		expect(publisher.declareCount).toBe(1);

		await ctx[Symbol.asyncDispose]();
		expect(publisher.flushCount).toBe(1);
	});
});
