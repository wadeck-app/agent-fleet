import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = vi.fn().mockResolvedValue({
				path: '/tmp/test-workspace',
				metaDir: '/tmp/test-workspace.meta',
				id: 'ws-test-id',
			});
			release = vi.fn().mockResolvedValue(undefined);
		},
	};
});

/** Stands in for both WorkerRegistry and WorkerProvisioner, which CommandHandler now takes. */
function createMockWorkerPool() {
	// listIdle() is derived from getIdle() so a test only has to say which socket is idle.
	// The worker is daemon-created, which the default acceptance rules let take any step.
	const pool = {
		// WorkerRegistry surface
		describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork' }),
		remove: vi.fn(),
		getIdle: vi.fn().mockReturnValue(undefined),
		listIdle: vi.fn((): unknown[] => {
			const ws: unknown = pool.getIdle();
			return ws === undefined
				? []
				: [
						{
							ws,
							worker: {
								state: 'idle',
								workerId: 'w-test',
								pid: 1,
								labels: [] as string[],
								attachedProjects: [] as string[],
								hasUserInterface: false,
								ephemeral: true,
							},
						},
					];
		}),
		markBusy: vi.fn(),
		markIdle: vi.fn(),
		hasBusyWorkers: vi.fn().mockReturnValue(false),
		send: vi.fn().mockReturnValue(true),
		broadcast: vi.fn(),
		register: vi.fn(),
		// WorkerProvisioner surface
		canProvision: vi.fn().mockReturnValue(false),
		planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		provision: vi.fn().mockResolvedValue(undefined),
		registerWorker: vi.fn().mockReturnValue(true),
	};
	return pool;
}

const mockExecStore = {
	create: vi.fn(),
	read: vi.fn().mockReturnValue({ steps: {} }),
	exists: vi.fn().mockReturnValue(false),
	markStepRunning: vi.fn(),
	markStepCompleted: vi.fn(),
	markStepFailed: vi.fn(),
	markStepSkipped: vi.fn(),
	markExecutionCompleted: vi.fn(),
	markExecutionFailed: vi.fn(),
	pruneOldExecutions: vi.fn(),
	update: vi.fn(),
};

const mockLogWriter = {
	write: vi.fn(),
	writeExecution: vi.fn(),
};

const PARENT_FLOW_YAML = `\
id: parent-flow
version: "1.0.0"
name: Parent Flow
description: Flow with parent step
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: parent
    name: Parent
    type: script
    script: echo parent
`;

let tmpDir: string;
let daemonDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-parent-test-'));
	daemonDir = path.join(tmpDir, 'daemon');
	fs.mkdirSync(daemonDir, { recursive: true });
	vi.clearAllMocks();
	mockExecStore.read.mockReturnValue({ steps: {} });
	mockExecStore.exists.mockReturnValue(false);
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeHandler(workerPool = createMockWorkerPool()): CommandHandler {
	return new CommandHandler(
		daemonDir,
		workerPool as never,
		workerPool as never,
		undefined,
		mockExecStore as never,
		mockLogWriter as never
	);
}

async function startParentFlow(handler: CommandHandler): Promise<string> {
	const flowFile = path.join(tmpDir, 'parent-flow.yml');
	fs.writeFileSync(flowFile, PARENT_FLOW_YAML);
	const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	expect(result.type).toBe('execution_started');
	return (result as { executionId: string }).executionId;
}

describe('CommandHandler — parent-blocking sub-steps', () => {
	describe('deferral: parent with pending sub-step', () => {
		it('onStepCompleted does not complete the parent when sub-steps are pending', async () => {
			const workerPool = createMockWorkerPool();
			const handler = makeHandler(workerPool);
			const executionId = await startParentFlow(handler);

			// Inject a sub-step under the parent
			handler.injectSteps(executionId, [
				{
					id: 'child1',
					name: 'Child 1',
					type: 'script',
					script: 'echo child',
					parent: 'parent',
				} as never,
			]);

			// Parent completes -- but child1 is still pending, so execution must remain active
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });

			// Execution must still be active (completion was deferred)
			expect(handler.hasActiveExecutions()).toBe(true);
		});
	});

	describe('deferral: sub-step completes → parent deferred completion fires', () => {
		it('execution completes after all sub-steps complete', async () => {
			const workerPool = createMockWorkerPool();
			const handler = makeHandler(workerPool);
			const executionId = await startParentFlow(handler);

			handler.injectSteps(executionId, [
				{
					id: 'child1',
					name: 'Child 1',
					type: 'script',
					script: 'echo child',
					parent: 'parent',
				} as never,
			]);

			// Parent completes -- deferred because child1 is still pending
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });
			expect(handler.hasActiveExecutions()).toBe(true);

			// Child completes -- should fire parent's deferred completion -> execution ends
			handler.onStepCompleted(executionId, 'child1', { result: 'child done' });
			expect(handler.hasActiveExecutions()).toBe(false);
		});
	});

	describe('child failure → parent re-run (default behavior)', () => {
		it('execution stays active and parent is re-queued when sub-step fails (first attempt)', async () => {
			const workerPool = createMockWorkerPool();
			const handler = makeHandler(workerPool);
			const executionId = await startParentFlow(handler);

			handler.injectSteps(executionId, [
				{
					id: 'child1',
					name: 'Child 1',
					type: 'script',
					script: 'echo child',
					parent: 'parent',
				} as never,
			]);

			// Parent completes -- deferred because child1 is still pending
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });
			expect(handler.hasActiveExecutions()).toBe(true);

			// Child fails -- parent should be re-queued (not execution failed)
			handler.onStepFailed(executionId, 'child1', 'child error');

			// Execution must still be active (parent re-queued for re-run)
			expect(handler.hasActiveExecutions()).toBe(true);
			// Execution store must NOT have been marked failed
			expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();
		});

		it('execution fails after maxSubStepIterations (default 3) re-run cycles', async () => {
			const workerPool = createMockWorkerPool();
			const handler = makeHandler(workerPool);

			// Write a flow with maxSubStepIterations: 1 so the test terminates quickly
			const flowFile = path.join(tmpDir, 'fast-fail-flow.yml');
			fs.writeFileSync(
				flowFile,
				`\
id: fast-fail-flow
version: "1.0.0"
name: Fast-fail Flow
description: Flow where parent fails after 1 iteration
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: parent
    name: Parent
    type: script
    script: echo parent
    maxSubStepIterations: 1
`
			);
			const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
			expect(result.type).toBe('execution_started');
			const executionId = (result as { executionId: string }).executionId;

			// Iteration 1: parent runs -> inject child -> child fails -> parent re-queued (1 <= 1)
			handler.injectSteps(executionId, [
				{ id: 'child-0', type: 'script', script: 'echo x', parent: 'parent' } as never,
			]);
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });
			handler.onStepFailed(executionId, 'child-0', 'err-0');
			expect(handler.hasActiveExecutions()).toBe(true);
			expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();

			// Iteration 2: parent re-runs -> inject child -> child fails -> 2 > 1 -> parent fails
			handler.injectSteps(executionId, [
				{ id: 'child-1', type: 'script', script: 'echo x', parent: 'parent' } as never,
			]);
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done again' });
			handler.onStepFailed(executionId, 'child-1', 'err-1');

			expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
			expect(handler.hasActiveExecutions()).toBe(false);
		});
	});

	describe('idempotent injection: re-injecting an existing pending step is a no-op', () => {
		it('does not throw and does not re-inject when step already exists and is not in-flight', async () => {
			const workerPool = createMockWorkerPool();
			const handler = makeHandler(workerPool);
			const executionId = await startParentFlow(handler);

			const subStep = {
				id: 'child1',
				name: 'Child 1',
				type: 'script',
				script: 'echo child',
				parent: 'parent',
			} as never;

			// First injection -- should succeed
			expect(() => handler.injectSteps(executionId, [subStep])).not.toThrow();

			// Second injection of the same step (loop re-run) -- must be a no-op, not throw
			expect(() => handler.injectSteps(executionId, [subStep])).not.toThrow();

			// Execution still active
			expect(handler.hasActiveExecutions()).toBe(true);
		});
	});
});

describe('CommandHandler — engine-side sub-step failures (stall watchdog, lost worker)', () => {
	const WAIT_ALL_FLOW_YAML = PARENT_FLOW_YAML.replace('id: parent-flow', 'id: wait-all-flow').replace(
		'    script: echo parent\n',
		'    script: echo parent\n    subStepStrategy: wait-all\n'
	);

	async function startWaitAllFlow(handler: CommandHandler): Promise<string> {
		const flowFile = path.join(tmpDir, 'wait-all-flow.yml');
		fs.writeFileSync(flowFile, WAIT_ALL_FLOW_YAML);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		return (result as { executionId: string }).executionId;
	}

	const child = (id: string, depends?: string[]) =>
		({
			id,
			name: id,
			type: 'script',
			script: 'echo x',
			parent: 'parent',
			...(depends ? { depends } : {}),
		}) as never;

	// A step's OWN failure reported by its worker (as opposed to the engine giving up on it, below):
	// the wait-all strategy settles the dependents and keeps going. Modelled through onStepFailed.
	it('records a sibling that depended on a sub-step that failed on its own as not run, with the reason, and keeps the execution going', async () => {
		const handler = makeHandler();
		const executionId = await startWaitAllFlow(handler);
		handler.injectSteps(executionId, [child('a'), child('b', ['a'])]);
		handler.onStepCompleted(executionId, 'parent', {});

		handler.onStepFailed(executionId, 'a', 'Script exited with code 1');

		expect(mockExecStore.markStepSkipped).toHaveBeenCalledTimes(1);
		expect(mockExecStore.markStepSkipped).toHaveBeenCalledWith(
			executionId,
			'b',
			expect.stringContaining("sub-step 'a' it depends on did not succeed")
		);
		expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();
		expect(handler.hasActiveExecutions()).toBe(true);
	});

	// What the stall watchdog and the lost-worker path call. Reached through the private outcomes
	// collaborator because driving a real stall needs a full worker/assignment harness.
	const failStepByEngine = (handler: CommandHandler, executionId: string, stepId: string, reason: string): void =>
		(handler as unknown as { outcomes: { failStep(e: string, s: string, r: string): void } }).outcomes.failStep(
			executionId,
			stepId,
			reason
		);

	const STALL = 'the worker running this step reported nothing for 1800s, so it is treated as stuck.';

	it('fails the execution terminally when the engine fails a sub-step (restart-on-first-failure): no parent relaunch', async () => {
		const handler = makeHandler();
		const executionId = await startParentFlow(handler);
		handler.injectSteps(executionId, [child('a')]);
		handler.onStepCompleted(executionId, 'parent', {});

		failStepByEngine(handler, executionId, 'a', STALL);

		expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('fails the execution terminally at once when the engine fails a wait-all sub-step, without waiting for its siblings', async () => {
		const handler = makeHandler();
		const executionId = await startWaitAllFlow(handler);
		handler.injectSteps(executionId, [child('a'), child('b')]);
		handler.onStepCompleted(executionId, 'parent', {});

		failStepByEngine(handler, executionId, 'a', STALL);

		expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('records the parent as failed with an actionable engine-failure message that keeps the real error', async () => {
		const handler = makeHandler();
		const executionId = await startParentFlow(handler);
		handler.injectSteps(executionId, [child('a')]);
		handler.onStepCompleted(executionId, 'parent', {});

		failStepByEngine(handler, executionId, 'a', STALL);

		const parentCall = mockExecStore.markStepFailed.mock.calls.find(call => call[1] === 'parent');
		expect(parentCall).toBeDefined();
		const message = String(parentCall![2]);
		expect(message).toContain("Sub-step 'a'");
		expect(message).toContain('engine failure');
		expect(message).toContain(STALL);
		expect(message).toContain('not retried');
		expect(mockLogWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining(message),
			'error'
		);
	});

	async function startRetryFlow(handler: CommandHandler): Promise<string> {
		const flowFile = path.join(tmpDir, 'retry-flow.yml');
		fs.writeFileSync(
			flowFile,
			PARENT_FLOW_YAML.replace('id: parent-flow', 'id: retry-flow').replace(
				'    script: echo parent\n',
				'    script: echo parent\n    retry:\n      maxAttempts: 2\n      backoff: linear\n'
			)
		);
		const started = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		return (started as { executionId: string }).executionId;
	}

	it('does not retry a top-level step with retry when the engine fails it', async () => {
		const handler = makeHandler();
		const executionId = await startRetryFlow(handler);

		failStepByEngine(handler, executionId, 'parent', STALL);

		expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('still retries a top-level step with retry when it fails on its own', async () => {
		const handler = makeHandler();
		const executionId = await startRetryFlow(handler);

		handler.onStepFailed(executionId, 'parent', 'Script exited with code 1');

		expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();
		expect(handler.hasActiveExecutions()).toBe(true);
	});
});
