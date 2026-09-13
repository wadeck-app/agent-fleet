/**
 * The core deliverable, end to end: a worker the daemon did not create runs a step (D#48).
 *
 * Everything else in this feature exists to make this work, and until now nothing exercised
 * the whole path at once. A real daemon resolves the project, admits an external worker on
 * its credential, routes a step to it rather than forking one, binds the result to the
 * assignment it issued, and records which worker ran it.
 *
 * The worker here is a socket rather than a child process, which is the point: it stands in
 * for `flow worker` in a terminal, and a real terminal cannot be had in a test runner.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import type { DaemonToWorker, ExecutionState } from '../ipc/Protocol';
import { type TestDaemonContext, startTestDaemon } from '../test-utils/TestHelpers';

const FLOW_YAML = `\
id: registered-worker-flow
version: "1.0.0"
name: Registered Worker Flow
description: dispatched to a worker the daemon did not create
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: only-step
    name: Only Step
    type: script
    script: echo hello
`;

let ctx: TestDaemonContext;
let projectRoot: string;
let socket: WebSocket | undefined;

beforeEach(async () => {
	// A real project, because a non-ephemeral worker only serves the projects it declared
	// (D#9) and the daemon resolves that from the marker file (D#50).
	projectRoot = mkdtempSync(join(tmpdir(), 'registered-project-'));
	mkdirSync(join(projectRoot, '.flow'), { recursive: true });
	writeFileSync(join(projectRoot, '.flow', 'config.yml'), 'version: 1\n', 'utf8');
	writeFileSync(join(projectRoot, 'flow.yml'), FLOW_YAML, 'utf8');

	// Concurrency 0 so the daemon forks nothing: if a forked worker could run the step, these
	// tests would pass whether or not the registered worker was ever considered.
	ctx = await startTestDaemon({ concurrency: 0 });
	// The client discovers the daemon through `config.port`, so a run submitted before that
	// file lands dials the default port and finds nothing there.
	await waitForFile(join(ctx.daemonDir, 'config.port'));
});

/** Waits for a file the daemon writes when it becomes reachable. */
async function waitForFile(path: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt++) {
		if (existsSync(path)) return;
		await new Promise(resolve => setTimeout(resolve, 20));
	}
	throw new Error(`the daemon never wrote "${path}", so it never became reachable`);
}

afterEach(async () => {
	socket?.close();
	socket = undefined;
	await ctx[Symbol.asyncDispose]();
	rmSync(projectRoot, { recursive: true, force: true });
});

/** Reads the port the daemon published, exactly as a worker does. */
async function workerUrl(): Promise<string> {
	const portFile = join(ctx.daemonDir, 'worker.port');
	for (let attempt = 0; attempt < 100; attempt++) {
		if (existsSync(portFile)) {
			const { port } = JSON.parse(readFileSync(portFile, 'utf8')) as { port: number };
			return `ws://127.0.0.1:${String(port)}`;
		}
		await new Promise(resolve => setTimeout(resolve, 20));
	}
	throw new Error('the daemon never published a worker port');
}

/**
 * Connects a worker that behaves like `flow worker`: announces itself as attached to the
 * project, reports each step as started, and completes it.
 */
async function connectRegisteredWorker(options: { reportStarted?: boolean } = {}): Promise<{
	assigned: string[];
	sent: Record<string, unknown>[];
}> {
	const token = readFileSync(join(ctx.daemonDir, 'health_token'), 'utf8').trim();
	const ws = new WebSocket(await workerUrl());
	socket = ws;
	const assigned: string[] = [];
	const sent: Record<string, unknown>[] = [];

	const send = (message: Record<string, unknown>): void => {
		sent.push(message);
		ws.send(JSON.stringify(message));
	};

	await new Promise<void>((resolve, reject) => {
		ws.once('open', () => resolve());
		ws.once('error', reject);
	});

	const registration = {
		type: 'ready',
		// Deliberately not a pid this daemon spawned, so admission goes through the
		// credential path rather than provenance.
		pid: 991_001,
		authToken: token,
		attachedProjects: [projectRoot],
		hasUserInterface: false,
	};

	ws.on('message', (data: Buffer) => {
		const message = JSON.parse(data.toString()) as DaemonToWorker;
		if (message.type !== 'assign') return;
		assigned.push(message.stepId);
		const { assignmentId, stepId, executionContext } = message;
		if (options.reportStarted !== false) {
			send({ type: 'step_started', assignmentId, executionId: executionContext.executionId, stepId });
		}
		send({
			type: 'step_completed',
			assignmentId,
			executionId: executionContext.executionId,
			stepId,
			output: { stdout: 'hello' },
		});
		send({ ...registration });
	});

	send(registration);
	return { assigned, sent };
}

async function runFlow(): Promise<string> {
	const response = (await ctx.client.send('run', {
		type: 'run',
		flowFile: join(projectRoot, 'flow.yml'),
		cwd: projectRoot,
		inputs: {},
	})) as { type: string; executionId?: string; message?: string };

	if (response.type !== 'execution_started') {
		throw new Error(
			`the daemon refused the run: ${JSON.stringify(response)} (config.port=${readFileSync(join(ctx.daemonDir, 'config.port'), 'utf8')})`
		);
	}
	return response.executionId!;
}

/** Waits for the execution to settle, then returns it. */
async function settledExecution(executionId: string): Promise<ExecutionState> {
	const stateFile = join(ctx.daemonDir, 'executions', `${executionId}.json`);
	let state: ExecutionState | undefined;
	await vi.waitFor(
		() => {
			expect(existsSync(stateFile)).toBe(true);
			state = JSON.parse(readFileSync(stateFile, 'utf8')) as ExecutionState;
			expect(['completed', 'failed']).toContain(state.status);
		},
		{ timeout: 15_000, interval: 100 }
	);
	return state!;
}

/**
 * Queues the flow first, then brings the worker in.
 *
 * That order is deliberate and is the realistic one: a worker joining an *idle* daemon makes
 * it shut down (D#51 -- the worker outlives it and re-registers), so a test that connects
 * first would race the daemon's own exit. With work already queued the daemon stays up, and
 * the step waits for capacity exactly as it would in a real run.
 */
async function queueFlowThenConnectWorker(): Promise<{ executionId: string; assigned: string[] }> {
	const executionId = await runFlow();
	const worker = await connectRegisteredWorker();
	return { executionId, assigned: worker.assigned };
}

describe('a step running on a worker the daemon did not create', () => {
	it('is dispatched to that worker rather than to a forked one', async () => {
		const { executionId, assigned } = await queueFlowThenConnectWorker();

		await settledExecution(executionId);

		expect(assigned).toEqual(['only-step']);
	});

	it('completes the execution', async () => {
		const { executionId } = await queueFlowThenConnectWorker();

		const state = await settledExecution(executionId);

		expect(state.status).toBe('completed');
	});

	// T-06: a wrong result has to be traceable to the worker that produced it.
	it('records which worker ran the step', async () => {
		const { executionId } = await queueFlowThenConnectWorker();

		const state = await settledExecution(executionId);

		expect(state.steps['only-step']?.workerId).toBeTruthy();
	});

	// D#10: the run is attributed to the project it came from, which is also what lets a
	// registered worker be considered for it at all.
	it('attributes the run to the project it was started from', async () => {
		const { executionId } = await queueFlowThenConnectWorker();

		const state = await settledExecution(executionId);

		expect(state.projectRoot).toBe(projectRoot);
	});
});

/**
 * Connects a worker that takes a step and then vanishes, without completing it.
 *
 * `reportStarted` decides which half of D#65 is exercised: a step that never began is free to
 * re-dispatch, while one already executing is a failure the author's retry policy governs.
 */
async function connectVanishingWorker(options: { reportStarted: boolean }): Promise<{ assigned: string[] }> {
	const token = readFileSync(join(ctx.daemonDir, 'health_token'), 'utf8').trim();
	const ws = new WebSocket(await workerUrl());
	const assigned: string[] = [];

	await new Promise<void>((resolve, reject) => {
		ws.once('open', () => resolve());
		ws.once('error', reject);
	});

	ws.on('message', (data: Buffer) => {
		const message = JSON.parse(data.toString()) as DaemonToWorker;
		if (message.type !== 'assign') return;
		assigned.push(message.stepId);
		if (options.reportStarted) {
			ws.send(
				JSON.stringify({
					type: 'step_started',
					assignmentId: message.assignmentId,
					executionId: message.executionContext.executionId,
					stepId: message.stepId,
				})
			);
		}
		// Drops the connection holding the step, exactly as closing a terminal would.
		setTimeout(() => ws.terminate(), 50);
	});

	ws.send(
		JSON.stringify({
			type: 'ready',
			pid: 991_003,
			authToken: token,
			attachedProjects: [projectRoot],
		})
	);

	return { assigned };
}

describe('a worker that disappears while holding a step (D#62, D#65)', () => {
	// The everyday case this feature creates: a terminal is closed before the step ran. It
	// costs the flow nothing, so the step goes back on the queue and another worker takes it.
	it('re-dispatches a step that never started, and the flow still completes', async () => {
		const executionId = await runFlow();
		const vanishing = await connectVanishingWorker({ reportStarted: false });
		await vi.waitFor(() => expect(vanishing.assigned).toEqual(['only-step']), { timeout: 10_000 });

		const replacement = await connectRegisteredWorker();
		const state = await settledExecution(executionId);

		expect(replacement.assigned).toEqual(['only-step']);
		expect(state.status).toBe('completed');
	});

	// The other half: it had begun, so it may already have had an effect. Replaying it
	// silently would be worse than failing, and the message has to say why.
	it('fails a step that had begun executing rather than replaying it', async () => {
		const executionId = await runFlow();
		const vanishing = await connectVanishingWorker({ reportStarted: true });
		await vi.waitFor(() => expect(vanishing.assigned).toEqual(['only-step']), { timeout: 10_000 });

		const state = await settledExecution(executionId);

		expect(state.status).toBe('failed');
		expect(state.steps['only-step']?.error ?? '').toMatch(/disconnected while it was executing/i);
	});
});

describe('a registered worker serving a project it never declared', () => {
	// The other half of D#9: attachment is explicit, so a worker attached elsewhere must not
	// be handed this project's step. The daemon forks instead, so the flow still runs -- the
	// assertion is that *this* worker was passed over.
	it('is not given the step', async () => {
		const executionId = await runFlow();
		const token = readFileSync(join(ctx.daemonDir, 'health_token'), 'utf8').trim();
		const ws = new WebSocket(await workerUrl());
		socket = ws;
		const assigned: string[] = [];
		await new Promise<void>((resolve, reject) => {
			ws.once('open', () => resolve());
			ws.once('error', reject);
		});
		ws.on('message', (data: Buffer) => {
			const message = JSON.parse(data.toString()) as DaemonToWorker;
			if (message.type === 'assign') assigned.push(message.stepId);
		});
		ws.send(
			JSON.stringify({
				type: 'ready',
				pid: 991_002,
				authToken: token,
				attachedProjects: [join(tmpdir(), 'some-other-project')],
			})
		);

		// Long enough for a dispatch to have happened had one been going to.
		await new Promise(resolve => setTimeout(resolve, 1_500));

		expect(assigned).toEqual([]);
		expect(executionId).toBeTruthy();
	});
});
