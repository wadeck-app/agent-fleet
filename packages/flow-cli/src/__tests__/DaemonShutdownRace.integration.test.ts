/**
 * Reproduces the idle-shutdown race between `flow run` auto-starting the daemon and the
 * run command actually landing (see Daemon.ts's SHUTDOWN_GRACE_MS).
 *
 * `checkShutdown()` fires whenever a worker's own `'ready'` message arrives (not only when a
 * step finishes), and a worker joining a daemon with nothing queued is indistinguishable from
 * a worker joining a genuinely idle one -- that distinction is exactly what SHUTDOWN_GRACE_MS
 * buys: a short window for the "run" command, already in flight over IPC, to land before the
 * daemon commits to stopping.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import type { DaemonToWorker, ExecutionState } from '../ipc/Protocol';
import { type TestDaemonContext, startTestDaemon } from '../test-utils/TestHelpers';

const FLOW_YAML = `\
id: shutdown-race-flow
version: "1.0.0"
name: Shutdown Race Flow
description: single step used to probe the idle-shutdown race
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
	projectRoot = mkdtempSync(join(tmpdir(), 'shutdown-race-project-'));
	mkdirSync(join(projectRoot, '.flow'), { recursive: true });
	writeFileSync(join(projectRoot, '.flow', 'config.yml'), 'version: 1\n', 'utf8');
	writeFileSync(join(projectRoot, 'flow.yml'), FLOW_YAML, 'utf8');

	// Concurrency 0: nothing this daemon forks can mask the race -- only the registered
	// worker connected below can ever run the step.
	ctx = await startTestDaemon({ concurrency: 0 });
	await waitForFile(join(ctx.daemonDir, 'config.port'));
});

afterEach(async () => {
	socket?.close();
	socket = undefined;
	await ctx[Symbol.asyncDispose]();
	rmSync(projectRoot, { recursive: true, force: true });
});

async function waitForFile(path: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt++) {
		if (existsSync(path)) return;
		await new Promise(resolve => setTimeout(resolve, 20));
	}
	throw new Error(`the daemon never wrote "${path}", so it never became reachable`);
}

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

/** Connects a worker and sends its `'ready'` registration -- nothing is queued yet. */
async function connectIdleRegisteredWorker(): Promise<{ assigned: string[] }> {
	const token = readFileSync(join(ctx.daemonDir, 'health_token'), 'utf8').trim();
	const ws = new WebSocket(await workerUrl());
	socket = ws;
	const assigned: string[] = [];

	await new Promise<void>((resolve, reject) => {
		ws.once('open', () => resolve());
		ws.once('error', reject);
	});

	const registration = {
		type: 'ready',
		pid: 991_101,
		authToken: token,
		attachedProjects: [projectRoot],
		hasUserInterface: false,
	};

	ws.on('message', (data: Buffer) => {
		const message = JSON.parse(data.toString()) as DaemonToWorker;
		if (message.type !== 'assign') return;
		assigned.push(message.stepId);
		const { assignmentId, stepId, executionContext } = message;
		ws.send(
			JSON.stringify({ type: 'step_started', assignmentId, executionId: executionContext.executionId, stepId })
		);
		ws.send(
			JSON.stringify({
				type: 'step_completed',
				assignmentId,
				executionId: executionContext.executionId,
				stepId,
				output: { stdout: 'hello' },
			})
		);
	});

	ws.send(JSON.stringify(registration));
	return { assigned };
}

async function runFlow(): Promise<string> {
	const response = (await ctx.client.send('run', {
		type: 'run',
		flowFile: join(projectRoot, 'flow.yml'),
		cwd: projectRoot,
		inputs: {},
	})) as { type: string; executionId?: string; message?: string };

	if (response.type !== 'execution_started') {
		throw new Error(`the daemon refused the run: ${JSON.stringify(response)}`);
	}
	return response.executionId!;
}

async function settledExecution(executionId: string): Promise<ExecutionState> {
	const stateFile = join(ctx.daemonDir, 'executions', `${executionId}.json`);
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (existsSync(stateFile)) {
			const state = JSON.parse(readFileSync(stateFile, 'utf8')) as ExecutionState;
			if (state.status === 'completed' || state.status === 'failed') return state;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`execution ${executionId} did not settle within 15s`);
}

describe('the idle-shutdown race between a worker ready and a run landing', () => {
	// Direct reproduction: the worker's 'ready' arrives while the queue is still empty --
	// exactly the state checkShutdown() reads as "genuinely idle" -- and the run command
	// is only submitted afterwards, standing in for the IPC round trip `flow run` needs to
	// actually deliver it. Before the fix this made the daemon stop synchronously, so the
	// run below would be refused (daemon no longer reachable) instead of completing.
	it('does not stop the daemon before a run submitted just after the ready lands', async () => {
		const worker = await connectIdleRegisteredWorker();

		// No delay: in production the "ready" and the "run" race each other over separate
		// IPC/WebSocket connections with no ordering guarantee: this is the tightest version
		// of that race, and the grace period must absorb it.
		const executionId = await runFlow();

		const state = await settledExecution(executionId);

		expect(state.status).toBe('completed');
		expect(worker.assigned).toEqual(['only-step']);
	});

	// The feature this grace period must not break: a daemon with nothing queued, and
	// nothing arriving, still has to exit on its own -- that's the resource-usage reason
	// idle shutdown exists at all (D#51's counterpart: it must still happen eventually).
	it('still stops once genuinely idle, once the grace period elapses', async () => {
		await connectIdleRegisteredWorker();

		// Long enough to clear Daemon.ts's SHUTDOWN_GRACE_MS (1s) with margin, short enough
		// to keep the test fast.
		await new Promise(resolve => setTimeout(resolve, 2_500));

		await expect(runFlow()).rejects.toThrow();
	});
});
