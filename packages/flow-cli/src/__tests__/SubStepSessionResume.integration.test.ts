/**
 * Sub-step failure feedback through a real daemon: the parent model step is relaunched in
 * its existing session with only the feedback.
 *
 * A real daemon schedules a model parent (`phase`) and a script child (`verify`) that fails
 * once with stderr "E1". The worker is a socket standing in for `flow worker`; for the model
 * step it runs the REAL WorkerAdapter -> StepRunner -> ModelStepExecutor with a recording
 * ModelProvider (no model, no CLI), so what the provider receives is what a real run would send.
 */
import { createTempDirectory } from 'flow-core/testing';
import { StepRunner } from 'flow-engine';
import type { LaunchOptions, ModelProvider } from 'flow-engine/processing/ModelProvider';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { WORKER_FEATURE_PROJECT_ID, WORKER_FEATURE_SUB_STEP_SESSION_RESUME } from '../ipc/Protocol';
import type { DaemonToWorker, ExecutionState, WorkerToDaemon } from '../ipc/Protocol';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { type TestDaemonContext, startTestDaemon } from '../test-utils/TestHelpers';
import { waitUntil } from '../test-utils/WaitHelpers';
import { WorkerAdapter } from '../worker/WorkerAdapter';

const FLOW_YAML = `\
id: substep-resume-flow
version: "1.0.0"
name: Sub-step resume
description: parent model step with a failing validation child
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: phase
    name: Phase
    type: model
    provider: opencode
    prompt: ORIGINAL-PROMPT
  - id: verify
    name: Verify
    type: script
    parent: phase
    script: echo verify
`;

let ctx: TestDaemonContext;
let projectRoot: string;
let projectId: string;
let registry: RegisteredProjectFixture;
let socket: WebSocket | undefined;

beforeEach(async () => {
	// The daemon resolves the project of each run from the registry in this process's environment.
	registry = new RegisteredProjectFixture().useAsProcessEnv();
	projectRoot = createTempDirectory('substep-resume-project-');
	projectId = (await registry.register('substep-resume', { folder: projectRoot })).id;
	writeFileSync(join(projectRoot, 'flow.yml'), FLOW_YAML, 'utf8');
	ctx = await startTestDaemon({ concurrency: 0 });
	await waitUntil(() => existsSync(join(ctx.daemonDir, 'config.port')), {
		timeoutMs: 4_000,
		failureMessage: 'the daemon never wrote config.port',
	});
});

afterEach(async () => {
	socket?.close();
	socket = undefined;
	await ctx[Symbol.asyncDispose]();
	registry.dispose();
});

interface Scenario {
	launches: LaunchOptions[];
	assigns: Extract<DaemonToWorker, { type: 'assign' }>[];
}

/** Recording provider: emits a session id like a real CLI's first stream event. */
function recordingProvider(launches: LaunchOptions[]): ModelProvider & { supportsSessionResume: boolean } {
	return {
		supportsSessionResume: true,
		launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
		launchBackground: options => {
			launches.push(options);
			options.onStreamEvent?.({ type: 'system', data: { session_id: 'ses_first' } } as never);
			options.onStreamEvent?.({ type: 'result', data: { result: 'ok' } } as never);
			return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
		},
		kill: () => {},
	};
}

async function connectWorker(declareFeatures: boolean): Promise<Scenario> {
	const scenario: Scenario = { launches: [], assigns: [] };
	const token = readFileSync(join(ctx.daemonDir, 'health_token'), 'utf8').trim();
	const { port } = JSON.parse(readFileSync(join(ctx.daemonDir, 'worker.port'), 'utf8')) as { port: number };
	const ws = new WebSocket(`ws://127.0.0.1:${String(port)}`);
	socket = ws;
	await new Promise<void>((resolve, reject) => {
		ws.once('open', () => resolve());
		ws.once('error', reject);
	});

	const adapter = new WorkerAdapter(
		() =>
			new StepRunner({
				interactive: false,
				providers: new Map([['opencode', recordingProvider(scenario.launches)]]),
			})
	);
	const registration = {
		type: 'ready',
		pid: 992_001,
		authToken: token,
		attachedProjectIds: [projectId],
		attachedProjects: [projectRoot],
		hasUserInterface: false,
		features: declareFeatures
			? [WORKER_FEATURE_PROJECT_ID, WORKER_FEATURE_SUB_STEP_SESSION_RESUME]
			: [WORKER_FEATURE_PROJECT_ID],
	};
	const send = (message: object): void => ws.send(JSON.stringify(message));
	let verifyRuns = 0;

	ws.on('message', (data: Buffer) => {
		const message = JSON.parse(data.toString()) as DaemonToWorker;
		if (message.type !== 'assign') return;
		scenario.assigns.push(message);
		const { assignmentId, stepId, executionContext } = message;
		const base = { assignmentId, executionId: executionContext.executionId, stepId };
		send({ type: 'step_started', ...base });

		if (stepId === 'verify') {
			verifyRuns++;
			if (verifyRuns === 1) {
				send({
					type: 'step_failed',
					...base,
					error: 'Script exited with code 1',
					output: { stderr: 'E1' },
					stderr: 'E1',
				});
			} else {
				send({ type: 'step_completed', ...base, output: { stdout: 'ok' } });
			}
			send({ ...registration });
			return;
		}

		void adapter
			.execute(message.stepConfig, executionContext, scoped =>
				send({ ...scoped, assignmentId } as WorkerToDaemon)
			)
			.then(({ output, meta }) => send({ type: 'step_completed', ...base, output, meta }))
			.catch((err: unknown) => send({ type: 'step_failed', ...base, error: String(err) }))
			.finally(() => send({ ...registration }));
	});

	ws.send(JSON.stringify(registration));
	return scenario;
}

async function runScenario(declareFeatures: boolean): Promise<{ executionId: string; scenario: Scenario }> {
	const response = (await ctx.client.send('run', {
		type: 'run',
		flowFile: join(projectRoot, 'flow.yml'),
		cwd: projectRoot,
		inputs: {},
	})) as { type: string; executionId?: string };
	if (response.type !== 'execution_started')
		throw new Error(`the daemon refused the run: ${JSON.stringify(response)}`);
	const scenario = await connectWorker(declareFeatures);
	return { executionId: response.executionId!, scenario };
}

function daemonLog(): string {
	const logDir = join(ctx.daemonDir, 'logs');
	const today = new Date().toISOString().slice(0, 10);
	const file = join(logDir, `${today}.ndjson`);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

/** Waits for the single final "Execution ..." line, which is what the run is judged by. */
async function settled(executionId: string): Promise<ExecutionState> {
	await vi.waitFor(
		() => {
			const log = daemonLog();
			const mine = log.split('\n').filter(line => line.includes(`[${executionId}|__execution]`));
			expect(mine.some(line => /Execution (completed|failed)/.test(line))).toBe(true);
		},
		{ timeout: 20_000, interval: 100 }
	);
	return JSON.parse(readFileSync(join(ctx.daemonDir, 'executions', `${executionId}.json`), 'utf8')) as ExecutionState;
}

describe('daemon -> worker -> model step: sub-step feedback resumes the parent session', () => {
	it('dispatches the restarted parent with the feedback, and the provider is resumed with only that feedback', async () => {
		const { executionId, scenario } = await runScenario(true);
		const state = await settled(executionId);

		expect(state.status).toBe('completed');

		// Daemon side: only the restarted parent carries the relaunch payload
		const phaseAssigns = scenario.assigns.filter(a => a.stepId === 'phase');
		expect(phaseAssigns).toHaveLength(2);
		expect(phaseAssigns[0]?.executionContext.subStepRelaunch).toBeUndefined();
		expect(phaseAssigns[1]?.executionContext.subStepRelaunch?.feedback).toContain('E1');
		expect(phaseAssigns[1]?.executionContext.stepMeta['phase']).toMatchObject({ session_id: 'ses_first' });
		for (const assign of scenario.assigns.filter(a => a.stepId === 'verify')) {
			expect(assign.executionContext.subStepRelaunch).toBeUndefined();
		}

		// Worker side: the real ModelStepExecutor handed the provider what the feature promises
		expect(scenario.launches).toHaveLength(2);
		expect(scenario.launches[0]?.resumeSessionId).toBeUndefined();
		expect(scenario.launches[0]?.prompt).toBe('ORIGINAL-PROMPT');
		expect(scenario.launches[1]?.resumeSessionId).toBe('ses_first');
		expect(scenario.launches[1]?.prompt).toContain('E1');
		expect(scenario.launches[1]?.prompt).not.toContain('ORIGINAL-PROMPT');
	}, 40_000);

	// s3pv7cdu: the store still held the failed child when the restarted parent completed, so
	// the daemon declared the run failed ("Execution failed", onFlowError) before the child ran again.
	it('settles the execution exactly once, as completed, with no premature "Execution failed"', async () => {
		const { executionId } = await runScenario(true);
		const state = await settled(executionId);

		const mine = daemonLog()
			.split('\n')
			.filter(line => line.includes(`[${executionId}|__execution]`));
		expect(mine.filter(line => line.includes('Execution failed'))).toHaveLength(0);
		expect(mine.filter(line => line.includes('Execution completed'))).toHaveLength(1);
		expect(state.status).toBe('completed');
		// The first attempt's failure must not linger on a step that finally succeeded
		expect(state.steps['verify']?.status).toBe('completed');
		expect(state.steps['verify']?.error).toBeUndefined();
		expect(state.steps['verify']?.stderr).toBeUndefined();
	}, 40_000);

	it('warns explicitly when the worker predates session resume (no silent degradation)', async () => {
		const { executionId } = await runScenario(false);
		await settled(executionId);

		const warning = daemonLog()
			.split('\n')
			.find(line => line.includes(`[${executionId}|__execution]`) && line.includes('"level":"warning"'));
		expect(warning).toBeDefined();
		expect(warning).toContain('phase');
		expect(warning).toContain('session');
		expect(warning).toContain('update');
	}, 40_000);
});
