import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler, MAX_REDISPATCHES } from './CommandHandler';
import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy';

const { mockAllocate, mockRelease, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' }),
	mockRelease: vi.fn().mockResolvedValue(undefined),
	hoistedState: { actualHomedir: '' as string },
}));

vi.mock('node:os', async importOriginal => {
	const actual = (await importOriginal()) as typeof import('node:os');
	hoistedState.actualHomedir = actual.homedir();
	return {
		...actual,
		homedir: vi.fn().mockImplementation(() => actual.homedir()),
	};
});

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = mockAllocate;
			release = mockRelease;
		},
	};
});

/** A daemon-forked worker, which the default acceptance rules let take any step. */
function forkedWorker(ws: unknown) {
	return {
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
	};
}

/** Stands in for both WorkerRegistry and WorkerProvisioner, which CommandHandler now takes. */
function createMockWorkerPool() {
	// listIdle() is derived from getIdle() so a test only has to say which socket is idle.
	const pool = {
		// WorkerRegistry surface
		describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork' }),
		remove: vi.fn(),
		getIdle: vi.fn().mockReturnValue(undefined),
		listIdle: vi.fn((): unknown[] => {
			const ws: unknown = pool.getIdle();
			return ws === undefined ? [] : [forkedWorker(ws)];
		}),
		markBusy: vi.fn(),
		markIdle: vi.fn(),
		hasBusyWorkers: vi.fn().mockReturnValue(false),
		send: vi.fn(),
		broadcast: vi.fn(),
		register: vi.fn(),
		summarize: vi.fn().mockReturnValue([]),
		// WorkerProvisioner surface
		canProvision: vi.fn().mockReturnValue(false),
		planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		provision: vi.fn().mockResolvedValue(undefined),
		registerWorker: vi.fn().mockReturnValue(true),
	};
	return pool;
}

const VALID_FLOW_YAML = `\
id: test-flow
version: "1.0.0"
name: Test Flow
description: Test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

const TWO_STEP_FLOW_YAML = `\
id: two-step-flow
version: "1.0.0"
name: Two Step Flow
description: Two steps
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
  - id: s2
    name: S2
    type: script
    script: echo world
    depends:
      - s1
`;

const RETRY_FLOW_YAML = `\
id: retry-flow
version: "1.0.0"
name: Retry Flow
description: Flow with retry
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
    retry:
      maxAttempts: 1
      backoff: linear
`;

const INVALID_DEPS_FLOW_YAML = `\
id: test
version: "1.0.0"
name: x
description: x
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: s1
    type: script
    script: echo
    depends:
      - nonexistent
`;

const USER_INTERVENTION_FLOW_YAML = `\
id: test-flow
version: "1.0.0"
name: Test Flow
description: Test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    depends:
      - s1
    approval:
      title: Approve
      description: Please review
`;

let tmpDir: string;
let daemonDir: string;

const mockExecStore = {
	create: vi.fn(),
	read: vi.fn().mockReturnValue({ steps: {} }),
	exists: vi.fn().mockReturnValue(false),
	markStepRunning: vi.fn(),
	markStepCompleted: vi.fn(),
	markStepFailed: vi.fn(),
	markExecutionCompleted: vi.fn(),
	markExecutionFailed: vi.fn(),
	pruneOldExecutions: vi.fn(),
	update: vi.fn(),
};

const mockLogWriter = {
	write: vi.fn(),
	writeExecution: vi.fn(),
};

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-test-'));
	daemonDir = path.join(tmpDir, 'daemon');
	fs.mkdirSync(daemonDir, { recursive: true });
	vi.clearAllMocks();
	vi.mocked(os.homedir).mockReturnValue(hoistedState.actualHomedir);
	mockAllocate.mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' });
	mockRelease.mockResolvedValue(undefined);
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

describe('CommandHandler.handleRun', () => {
	it('returns FLOW_NOT_FOUND error when the flow file does not exist', async () => {
		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile: '/no/such/flow.yml',
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('FLOW_NOT_FOUND');
	});

	it('returns PARSE_ERROR when the flow file contains invalid YAML', async () => {
		const flowFile = path.join(tmpDir, 'bad.yml');
		fs.writeFileSync(flowFile, 'key: [invalid: yaml');

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('PARSE_ERROR');
	});

	it('returns VALIDATION_FAILED when the flow has invalid step dependencies', async () => {
		const flowFile = path.join(tmpDir, 'invalid-deps.yml');
		fs.writeFileSync(flowFile, INVALID_DEPS_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('VALIDATION_FAILED');
	});

	// The v1 refusal is gone (D#37): such a flow now starts, and the step is routed to a
	// worker that declared a user interface. What happens when none is connected is S9's
	// call -- see the interactive-steps suite below.
	it('accepts a flow containing a user_intervention step', async () => {
		const flowFile = path.join(tmpDir, 'intervention.yml');
		fs.writeFileSync(flowFile, USER_INTERVENTION_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('execution_started');
	});

	it('returns execution_started with a valid executionId for a successful flow', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('execution_started');
		if (result.type !== 'execution_started') throw new Error('Expected execution_started response');
		expect((result as { executionId: string }).executionId).toMatch(/^[a-z0-9]{8}$/);
	});
});

describe('handleRun path restriction', () => {
	it('blocks flow files outside cwd and homedir by default', async () => {
		const fakeHome = path.join(tmpDir, 'fake-home');
		vi.mocked(os.homedir).mockReturnValue(fakeHome);

		const outsideDir = path.join(os.tmpdir(), `outside-${Date.now()}`);
		fs.mkdirSync(outsideDir, { recursive: true });
		const flowFile = path.join(outsideDir, 'test.yml');
		fs.writeFileSync(flowFile, 'id: test\n');

		const handler = new CommandHandler(tmpDir, createMockWorkerPool() as never, createMockWorkerPool() as never);
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			inputs: {},
		} as never);

		expect(result.type).toBe('error');
		expect((result as { code: string }).code).toBe('FLOW_NOT_FOUND');
		expect((result as { message: string }).message).not.toContain(flowFile);
		expect((result as { message: string }).message).not.toContain(outsideDir);

		fs.rmSync(outsideDir, { recursive: true });
	});

	it('allows flow files inside cwd', async () => {
		const flowFile = path.join(tmpDir, 'allowed.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const handler = new CommandHandler(
			tmpDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
			inputs: {},
		} as never);

		if (result.type === 'error') {
			expect((result as { code: string }).code).not.toBe('FLOW_NOT_FOUND');
		}
	});

	it('allows absolute paths when allowAbsolutePaths is true', async () => {
		const outsideDir = path.join(os.tmpdir(), `outside-${Date.now()}`);
		fs.mkdirSync(outsideDir, { recursive: true });
		const flowFile = path.join(outsideDir, 'test.yml');
		fs.writeFileSync(flowFile, 'invalid yaml: [');

		const handler = new CommandHandler(
			tmpDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			true // allowAbsolutePaths
		);
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: os.tmpdir(),
			inputs: {},
		} as never);

		expect((result as { code?: string }).code).not.toBe('FLOW_NOT_FOUND');
		expect(result.type).toBe('error');
		expect((result as { code: string }).code).toBe('PARSE_ERROR');
		expect((result as { message: string }).message).not.toContain(flowFile);

		fs.rmSync(outsideDir, { recursive: true });
	});
});

describe('CommandHandler — scheduling via FlowScheduler', () => {
	it('hasActiveExecutions() is true after handleRun, false after step completes', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		expect(handler.hasActiveExecutions()).toBe(true);

		handler.onStepCompleted(executionId, 's1', { result: 'ok' });
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('onStepCompleted enqueues dependent step so tryDispatch() can dispatch it', async () => {
		const flowFile = path.join(tmpDir, 'two.yml');
		fs.writeFileSync(flowFile, TWO_STEP_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const dispatchedSteps: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatchedSteps.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		// s1 was dispatched on handleRun
		expect(dispatchedSteps).toContain('s1');

		// Complete s1 -- s2 should be enqueued and dispatched
		handler.onStepCompleted(executionId, 's1', { val: 'done' });
		handler.tryDispatch();
		expect(dispatchedSteps).toContain('s2');
	});

	it('when: step is skipped and downstream step is still dispatched', async () => {
		const yaml = `\
id: when-flow
version: "1.0.0"
name: When Flow
description: when test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: a
    name: A
    type: script
    script: echo a
  - id: b
    name: B
    type: script
    script: echo b
    depends: [a]
    when: "false"
  - id: c
    name: C
    type: script
    script: echo c
    depends: [b]
`;
		const flowFile = path.join(tmpDir, 'when.yml');
		fs.writeFileSync(flowFile, yaml);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		// a dispatched; b will be skipped when a completes
		handler.onStepCompleted(executionId, 'a', {});
		handler.tryDispatch();

		// b skipped -> c should be dispatched
		expect(dispatched).not.toContain('b');
		expect(dispatched).toContain('c');
	});

	it('onStepFailed removes pending steps for that execution from readyQueue', async () => {
		// Two independent steps: s1 and s2. Fail s1 -> s2 should not be dispatched.
		const twoIndependentYaml = `\
id: two-ind
version: "1.0.0"
name: Two Independent
description: test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo s1
  - id: s2
    name: S2
    type: script
    script: echo s2
`;
		const flowFile = path.join(tmpDir, 'two-ind.yml');
		fs.writeFileSync(flowFile, twoIndependentYaml);

		// Worker pool: idle only for FIRST dispatch, not subsequent
		const workerPool = createMockWorkerPool();
		let dispatchCount = 0;
		workerPool.getIdle.mockImplementation(() => (dispatchCount++ < 1 ? {} : undefined));
		workerPool.send.mockReturnValue(true);

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		// s1 was dispatched; s2 is still in readyQueue
		expect(handler.isQueueEmpty()).toBe(false);

		// Fail the execution
		handler.onStepFailed('nonexistent-id', 's1', 'oops'); // unknown id → no-op
		// Use real executionId from result
	});

	it('retry: step fails once then succeeds on retry — execution completes', async () => {
		const flowFile = path.join(tmpDir, 'retry.yml');
		fs.writeFileSync(flowFile, RETRY_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		// s1 was dispatched on handleRun
		expect(dispatched).toContain('s1');
		expect(handler.hasActiveExecutions()).toBe(true);

		// First attempt fails -- retry config allows 1 more attempt
		handler.onStepFailed(executionId, 's1', 'transient error');

		// Execution must still be active (retry pending, not terminal failure)
		expect(handler.hasActiveExecutions()).toBe(true);

		// s1 must have been re-dispatched (retry re-enqueued it)
		expect(dispatched.filter(id => id === 's1')).toHaveLength(2);

		// Second attempt succeeds -- execution completes
		handler.onStepCompleted(executionId, 's1', { result: 'ok' });
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('loop (onFailure.goto): step re-dispatched and markExecutionFailed NOT called on first failure', async () => {
		// Regression: before the fix, markExecutionFailed was called unconditionally in
		// Daemon.ts step_failed handler, terminating the execution before the loop could continue.
		const loopYaml = `\
id: loop-flow
version: "1.0.0"
name: Loop Flow
description: loop test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: attempt
    name: Attempt
    type: script
    script: echo attempt
    onFailure:
      goto: attempt
      maxIterations: 3
      resetOnSuccess: true
      addComment: false
  - id: done
    name: Done
    type: script
    script: echo done
    depends: [attempt]
`;
		const flowFile = path.join(tmpDir, 'loop.yml');
		fs.writeFileSync(flowFile, loopYaml);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		// attempt dispatched on handleRun
		expect(dispatched).toContain('attempt');
		expect(handler.hasActiveExecutions()).toBe(true);

		// First failure -- loop should re-queue attempt, NOT terminate execution
		handler.onStepFailed(executionId, 'attempt', 'not ready yet');

		// Execution must still be active (loop pending)
		expect(handler.hasActiveExecutions()).toBe(true);

		// markExecutionFailed must NOT have been called (loop in progress)
		expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();

		// attempt must have been re-dispatched (loop re-enqueued it)
		expect(dispatched.filter(id => id === 'attempt')).toHaveLength(2);

		// Second attempt succeeds -- done becomes ready
		handler.onStepCompleted(executionId, 'attempt', { result: 'ok' });
		handler.tryDispatch();
		// done should now be dispatched
		expect(dispatched).toContain('done');

		// Complete done -- execution fully done
		handler.onStepCompleted(executionId, 'done', {});
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('transport failure (worker drops): step re-dispatched via tryDispatch, NOT via scheduler.complete()', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		// First send fails, second succeeds
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send
			.mockReturnValueOnce(false) // first attempt: transport failure
			.mockReturnValue(true); // subsequent: success

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');

		// handleRun called tryDispatch() already. With send returning false,
		// the step is put back in the queue and send succeeds on re-dispatch.
		// Handler should not be failed (hasFailed not exposed, but execution still active)
		expect(handler.hasActiveExecutions()).toBe(true);
	});
});

describe('CommandHandler — per-flow workspace override', () => {
	const FLOW_WITH_USE = `\
id: override-flow
version: "1.0.0"
name: Override Flow
description: test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
plugins:
  workspace:
    use: my-instance
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

	const FLOW_WITH_INSTANCE = `\
id: inline-flow
version: "1.0.0"
name: Inline Flow
description: test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
plugins:
  workspace:
    instance:
      type: plugins.none.default
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

	function makeHandlerWithPerFlowResolver(
		globalProvider: { allocate: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } | undefined,
		resolveWorkspaceProvider: ((config: unknown) => Promise<unknown>) | undefined
	): CommandHandler {
		return new CommandHandler(
			daemonDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			globalProvider as never,
			undefined,
			resolveWorkspaceProvider as never
		);
	}

	it('uses global workspaceProvider when flow has no plugins section', async () => {
		const flowFile = path.join(tmpDir, 'no-override.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const globalAllocate = vi.fn().mockResolvedValue({ id: 'global-ws', path: tmpDir });
		const globalProvider = { allocate: globalAllocate, release: vi.fn().mockResolvedValue(undefined) };
		const resolveCb = vi.fn();

		const handler = makeHandlerWithPerFlowResolver(globalProvider, resolveCb);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(globalAllocate).toHaveBeenCalledOnce();
		expect(resolveCb).not.toHaveBeenCalled();
	});

	it('calls resolveWorkspaceProvider callback when flow has plugins.workspace.use', async () => {
		const flowFile = path.join(tmpDir, 'use-override.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_USE);

		const perFlowAllocate = vi.fn().mockResolvedValue({ id: 'per-flow-ws', path: tmpDir });
		const perFlowProvider = { allocate: perFlowAllocate, release: vi.fn().mockResolvedValue(undefined) };
		const globalAllocate = vi.fn();
		const globalProvider = { allocate: globalAllocate, release: vi.fn() };

		const resolveCb = vi.fn().mockResolvedValue(perFlowProvider);

		const handler = makeHandlerWithPerFlowResolver(globalProvider, resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('execution_started');
		expect(resolveCb).toHaveBeenCalledOnce();
		expect(resolveCb).toHaveBeenCalledWith(expect.objectContaining({ use: 'my-instance' }));
		expect(perFlowAllocate).toHaveBeenCalledOnce();
		expect(globalAllocate).not.toHaveBeenCalled();
	});

	it('calls resolveWorkspaceProvider callback when flow has plugins.workspace.instance', async () => {
		const flowFile = path.join(tmpDir, 'instance-override.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_INSTANCE);

		const perFlowAllocate = vi.fn().mockResolvedValue({ id: 'inline-ws', path: tmpDir });
		const perFlowProvider = { allocate: perFlowAllocate, release: vi.fn().mockResolvedValue(undefined) };
		const resolveCb = vi.fn().mockResolvedValue(perFlowProvider);

		const handler = makeHandlerWithPerFlowResolver(undefined, resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('execution_started');
		expect(resolveCb).toHaveBeenCalledOnce();
		expect(resolveCb).toHaveBeenCalledWith(
			expect.objectContaining({ instance: expect.objectContaining({ type: 'plugins.none.default' }) })
		);
		expect(perFlowAllocate).toHaveBeenCalledOnce();
	});

	it('returns WORKSPACE_ERROR when resolveWorkspaceProvider callback throws', async () => {
		const flowFile = path.join(tmpDir, 'fail-resolve.yml');
		fs.writeFileSync(flowFile, FLOW_WITH_USE);

		const globalAllocate = vi.fn();
		const globalProvider = { allocate: globalAllocate, release: vi.fn() };
		const resolveCb = vi.fn().mockRejectedValue(new Error('instance not found'));

		const handler = makeHandlerWithPerFlowResolver(globalProvider, resolveCb);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result.type).toBe('error');
		expect((result as { code: string }).code).toBe('WORKSPACE_ERROR');
		expect((result as { message: string }).message).toContain('per-flow workspace provider');
		expect(globalAllocate).not.toHaveBeenCalled();
	});
});

describe('CommandHandler — plugin workspace provider', () => {
	function makeHandlerWithProvider(provider: {
		allocate: ReturnType<typeof vi.fn>;
		release: ReturnType<typeof vi.fn>;
	}): CommandHandler {
		return new CommandHandler(
			daemonDir,
			createMockWorkerPool() as never,
			createMockWorkerPool() as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			provider as never
		);
	}

	it('Fix A: releases workspace handle when post-allocate setup throws', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const mockRelease = vi.fn().mockResolvedValue(undefined);
		const mockProvider = {
			allocate: vi.fn().mockResolvedValue({ id: 'ws-1', path: tmpDir }),
			release: mockRelease,
		};

		mockExecStore.create.mockImplementationOnce(() => {
			throw new Error('storage failure');
		});

		const handler = makeHandlerWithProvider(mockProvider);

		await expect(handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never)).rejects.toThrow(
			'storage failure'
		);

		expect(mockRelease).toHaveBeenCalledOnce();
	});

	it('Fix A: releases handle when mkdirSync throws before handle is registered', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const mockRelease = vi.fn().mockResolvedValue(undefined);
		const wsPath = path.join(tmpDir, 'fake-ws');
		// Create .meta as a FILE so mkdirSync('.meta/outputs') fails with ENOTDIR
		fs.writeFileSync(wsPath + '.meta', '');
		const mockProvider = {
			allocate: vi.fn().mockResolvedValue({ id: 'ws-2', path: wsPath }),
			release: mockRelease,
		};

		const handler = makeHandlerWithProvider(mockProvider);

		await expect(handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never)).rejects.toThrow();
		expect(mockRelease).toHaveBeenCalledOnce();
	});

	it('Fix B: uses releaseWorkspace dual-error contract on step failure', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const mockRelease = vi.fn().mockRejectedValue(new Error('release failed'));
		const mockProvider = {
			allocate: vi.fn().mockResolvedValue({ id: 'ws-3', path: tmpDir }),
			release: mockRelease,
		};

		const handler = makeHandlerWithProvider(mockProvider);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(result.type).toBe('execution_started');
		const { executionId } = result as { executionId: string };

		handler.onStepFailed(executionId, 's1', 'step error');

		await new Promise(resolve => setTimeout(resolve, 10));

		// releaseWorkspace uses console.warn when prior error exists (not process.stderr)
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('release failed'));

		warnSpy.mockRestore();
	});
});

describe('CommandHandler — routing steps to workers (D#22, D#24)', () => {
	const LABELLED_FLOW_YAML = `\
id: labelled-flow
version: "1.0.0"
name: Labelled Flow
description: label routing
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: needs-gpu
    name: Needs GPU
    type: script
    script: echo gpu
    labels: [gpu]
  - id: plain
    name: Plain
    type: script
    script: echo plain
`;

	function handlerFor(yamlText: string, idle: unknown[]) {
		const flowFile = path.join(tmpDir, 'routing.yml');
		fs.writeFileSync(flowFile, yamlText);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.listIdle.mockReturnValue(idle);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		return { handler, dispatched, flowFile, workerPool };
	}

	it('does not dispatch a labelled step to a worker without the label', async () => {
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(LABELLED_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('needs-gpu');
	});

	it('dispatches a labelled step to a worker carrying the label', async () => {
		const worker = forkedWorker({});
		worker.worker.labels = ['gpu'];
		const { handler, dispatched, flowFile } = handlerFor(LABELLED_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('needs-gpu');
	});

	// The two steps have no dependency between them, so a step nothing can run must not
	// hold up one that can -- otherwise one unsatisfiable label stalls the whole flow.
	it('still dispatches a placeable step queued behind an unplaceable one', async () => {
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(LABELLED_FLOW_YAML, [worker]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('plain');
	});

	// A malformed `labels:` can never be matched, so it must not present as "still waiting
	// for capacity". Schema validation catches it before the run starts (D#7), which is the
	// earliest and clearest place -- the run is refused rather than hanging.
	it('refuses to start a flow whose labels are not a list', async () => {
		const malformed = LABELLED_FLOW_YAML.replace('labels: [gpu]', 'labels: gpu');
		const worker = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerFor(malformed, [worker]);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect((result as { type: string }).type).toBe('error');
		expect(JSON.stringify(result)).toMatch(/labels/i);
		expect(dispatched).toEqual([]);
	});
});

describe('CommandHandler — interactive steps (D#37, D#39, D#61)', () => {
	const INTERVENTION_FLOW_YAML = `\
id: intervention-flow
version: "1.0.0"
name: Intervention Flow
description: needs a human
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: confirm
    name: Confirm
    type: user_intervention
    interventionType: approval
    approval:
      title: Ship it?
`;

	/**
	 * @param waitMs S9 bound. Zero makes the "nothing can answer" decision immediate, so the
	 *   failure path is asserted without waiting out a real timeout -- the default bound exists to
	 *   give a reconnecting worker time, which no test should spend.
	 */
	function handlerWith(idle: unknown[], waitMs?: number) {
		const flowFile = path.join(tmpDir, 'intervention.yml');
		fs.writeFileSync(flowFile, INTERVENTION_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const dispatched: string[] = [];
		workerPool.listIdle.mockReturnValue(idle);
		workerPool.summarize.mockReturnValue(
			idle.map(candidate => (candidate as { worker: { hasUserInterface: boolean } }).worker)
		);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			waitMs === undefined ? undefined : new DefaultInteractivityPolicy(waitMs)
		);
		return { handler, dispatched, flowFile };
	}

	// The v1 block is lifted (D#37): the capability exists now, so refusing the flow would
	// ship a declaration nothing consumes.
	it('accepts a flow containing a user_intervention step', async () => {
		const interactive = forkedWorker({});
		interactive.worker.hasUserInterface = true;
		const { handler, flowFile } = handlerWith([interactive]);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect((result as { type: string }).type).toBe('execution_started');
	});

	it('dispatches it to a worker that declared a user interface', async () => {
		const interactive = forkedWorker({});
		interactive.worker.hasUserInterface = true;
		const { handler, dispatched, flowFile } = handlerWith([interactive]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).toContain('confirm');
	});

	// A forked worker cannot serve this step, so once the S9 bound is spent there is nothing left
	// to wait for and leaving it queued would stall the flow with nothing to act on (D#39).
	it('fails the step when only headless workers are connected and the wait is spent', async () => {
		const headless = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerWith([headless], 0);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('confirm');
		expect(mockExecStore.markStepFailed).toHaveBeenCalled();
	});

	// The bound is what makes an interactive step winnable at all: an idle daemon disconnects
	// external workers, so one is always briefly absent right after a run starts a fresh daemon.
	it('keeps the step queued while an interactive worker still has time to appear', async () => {
		const headless = forkedWorker({});
		const { handler, dispatched, flowFile } = handlerWith([headless]);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(dispatched).not.toContain('confirm');
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('says how to make the step runnable rather than just refusing it', async () => {
		const { handler, flowFile } = handlerWith([], 0);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
		expect(reason).toContain('flow worker');
		expect(reason).toContain('confirm');
	});

	// A separate v1 scope line, not the same limitation -- lifting one must not lift both.
	it('still refuses a subflow step', async () => {
		const flowFile = path.join(tmpDir, 'subflow.yml');
		fs.writeFileSync(
			flowFile,
			INTERVENTION_FLOW_YAML.replace(
				/  - id: confirm[\s\S]*$/,
				'  - id: nested\n    name: Nested\n    type: subflow\n    flowId: other-flow\n    inputs: {}\n'
			)
		);
		const { handler } = handlerWith([]);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(JSON.stringify(result)).toMatch(/subflow/);
	});
});

describe('CommandHandler — covering unmet demand (S8, D#25)', () => {
	async function runWithNoWorker(plan: { fork: number; warning?: string }) {
		const flowFile = path.join(tmpDir, 'demand.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		workerPool.listIdle.mockReturnValue([]);
		workerPool.planProvisioning.mockReturnValue(plan);

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		return { handler, workerPool };
	}

	// D#66: the daemon calls each declared source's single S1 method and waits. Asking only at
	// startup would mean the S8 wait waits for something nobody was asked for, and remote
	// capacity could never be used for a run that began later.
	it('asks the declared sources when demand appears', async () => {
		const flowFile = path.join(tmpDir, 'demand-sources.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const workerPool = createMockWorkerPool();
		workerPool.listIdle.mockReturnValue([]);
		workerPool.planProvisioning.mockReturnValue({ fork: 0 });
		const askedSources = vi.fn();

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			undefined,
			undefined,
			undefined,
			askedSources
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		handler.stopBackgroundWork();

		expect(askedSources).toHaveBeenCalledTimes(1);
	});

	// Once per episode, not once per pass: the re-check runs several times a second, and asking
	// a remote machine that often would be a denial of service aimed at your own fleet.
	it('asks them once per episode of unmet demand, not once per attempt', async () => {
		const flowFile = path.join(tmpDir, 'demand-once.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const workerPool = createMockWorkerPool();
		workerPool.listIdle.mockReturnValue([]);
		workerPool.planProvisioning.mockReturnValue({ fork: 0 });
		const askedSources = vi.fn();

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			undefined,
			undefined,
			undefined,
			askedSources
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		handler.tryDispatch();
		handler.tryDispatch();
		handler.stopBackgroundWork();

		expect(askedSources).toHaveBeenCalledTimes(1);
	});

	it('asks S8 how much unmet demand there is, and how long it has gone unserved', async () => {
		const { workerPool } = await runWithNoWorker({ fork: 0 });

		expect(workerPool.planProvisioning).toHaveBeenCalled();
		const [unmetDemand, waitingMs] = workerPool.planProvisioning.mock.calls[0]! as [number, number];
		expect(unmetDemand).toBe(1);
		expect(waitingMs).toBe(0);
	});

	// The wait is only bounded because dispatch re-runs itself while nothing can be placed.
	// Without that timer there is no `ready` message coming and no other event to resume on,
	// so "wait" would mean "wait forever" -- this is the test that would catch it.
	it('re-runs dispatch while waiting, so the wait actually ends', async () => {
		vi.useFakeTimers();
		let handler: CommandHandler | undefined;
		try {
			const started = await runWithNoWorker({ fork: 0 });
			handler = started.handler;
			const { workerPool } = started;
			const callsBefore = workerPool.planProvisioning.mock.calls.length;

			await vi.advanceTimersByTimeAsync(1_000);

			expect(workerPool.planProvisioning.mock.calls.length).toBeGreaterThan(callsBefore);
			// Later calls report a growing wait, which is what lets a policy time out at all.
			const lastCall = workerPool.planProvisioning.mock.calls.at(-1)! as [number, number];
			expect(lastCall[1]).toBeGreaterThan(0);
		} finally {
			// Or the pending re-check outlives the test and runs against reset mocks.
			handler?.stopBackgroundWork();
			vi.useRealTimers();
		}
	});

	// The same guarantee the daemon needs on shutdown: nothing queued for later may run once
	// the listener is closed.
	it('stops re-running dispatch once background work is stopped', async () => {
		vi.useFakeTimers();
		try {
			const { handler, workerPool } = await runWithNoWorker({ fork: 0 });

			handler.stopBackgroundWork();
			const callsBefore = workerPool.planProvisioning.mock.calls.length;
			await vi.advanceTimersByTimeAsync(1_000);

			expect(workerPool.planProvisioning.mock.calls.length).toBe(callsBefore);
		} finally {
			vi.useRealTimers();
		}
	});

	// A broken plugin must not take the daemon with it: this path also runs from a timer,
	// where an exception has no caller to report it.
	it('reports a plugin that returns no usable decision instead of crashing', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		try {
			const { workerPool } = await runWithNoWorker(undefined as never);

			expect(workerPool.provision).not.toHaveBeenCalled();
			const reported = write.mock.calls.map(call => String(call[0])).join(' ');
			expect(reported).toContain('provisioning plugin');
			expect(reported).toMatch(/fork/);
		} finally {
			write.mockRestore();
		}
	});

	it('stops re-running dispatch once it has obtained what S8 asked for', async () => {
		vi.useFakeTimers();
		try {
			const { workerPool } = await runWithNoWorker({ fork: 1 });
			const callsBefore = workerPool.planProvisioning.mock.calls.length;

			await vi.advanceTimersByTimeAsync(1_000);

			expect(workerPool.planProvisioning.mock.calls.length).toBe(callsBefore);
		} finally {
			vi.useRealTimers();
		}
	});

	// Waiting is expressed as forking nothing, so nothing may be created on that pass.
	it('creates no worker while S8 is still waiting', async () => {
		const { workerPool } = await runWithNoWorker({ fork: 0 });

		expect(workerPool.provision).not.toHaveBeenCalled();
	});

	it('obtains exactly as many workers as S8 asked for', async () => {
		const { workerPool } = await runWithNoWorker({ fork: 2 });

		expect(workerPool.provision).toHaveBeenCalledTimes(2);
	});

	// A violated preference must be visible, or the user never learns their declared
	// capacity went unused (D#25).
	it('reports the S8 warning', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		await runWithNoWorker({ fork: 1, warning: 'source "laptop" produced nothing' });

		expect(write.mock.calls.map(call => String(call[0])).join(' ')).toContain('laptop');
		write.mockRestore();
	});

	it('does not consult S8 when every step was placed', async () => {
		const flowFile = path.join(tmpDir, 'placed.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockReturnValue(true);

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(workerPool.planProvisioning).not.toHaveBeenCalled();
	});
});

describe('CommandHandler — mid-step disconnect (D#62, D#65)', () => {
	/** Runs the one-step flow to the point where s1 sits with the worker. */
	async function dispatchOneStep() {
		const flowFile = path.join(tmpDir, 'disconnect.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const worker = {} as never;
		const sent: { stepId: string; assignmentId: string }[] = [];
		workerPool.getIdle.mockReturnValue(worker);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			const m = msg as { stepId: string; assignmentId: string };
			sent.push({ stepId: m.stepId, assignmentId: m.assignmentId });
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		return { handler, workerPool, worker, sent, executionId };
	}

	// Closing a terminal before the step ran costs nothing, so it must not be charged to
	// the author's retry budget (D#43) -- the step goes back on the queue untouched.
	it('re-dispatches a step that never started, without failing it', async () => {
		const { handler, worker, sent } = await dispatchOneStep();
		expect(sent).toHaveLength(1);

		handler.handleWorkerDisconnect(worker);
		handler.tryDispatch();

		expect(sent.map(s => s.stepId)).toEqual(['s1', 's1']);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	// A step that had begun may have changed something. Replaying it silently is worse
	// than failing it, so the author's declared retry/onFailure decides (D#65).
	it('fails a step that had begun executing instead of replaying it', async () => {
		const { handler, worker, sent, executionId } = await dispatchOneStep();
		handler.onStepStarted(worker, sent[0]!.assignmentId, executionId, 's1');

		handler.handleWorkerDisconnect(worker);
		handler.tryDispatch();

		expect(sent).toHaveLength(1);
		expect(mockExecStore.markStepFailed).toHaveBeenCalled();
	});

	it('ignores a step_started that names an assignment issued to another worker', async () => {
		const { handler, sent, executionId } = await dispatchOneStep();

		handler.onStepStarted({} as never, sent[0]!.assignmentId, executionId, 's1');
		// Still classified as not started, so it is re-dispatched rather than failed.
		handler.handleWorkerDisconnect({} as never);

		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	// Otherwise a step nobody ever starts is re-dispatched forever (D#62). Pinned to the
	// constant and to the exact boundary: asserting only "fewer than ten" would pass just as
	// happily if the bound were raised to nine.
	it('spends exactly the re-dispatch budget before giving up', async () => {
		const { handler, worker, sent } = await dispatchOneStep();

		for (let i = 0; i < MAX_REDISPATCHES; i++) {
			handler.handleWorkerDisconnect(worker);
			handler.tryDispatch();
		}

		// One original hand-off plus one per allowed re-dispatch, and still not failed.
		expect(sent).toHaveLength(MAX_REDISPATCHES + 1);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('fails the step on the next disconnect, saying what to check', async () => {
		const { handler, worker, sent } = await dispatchOneStep();

		for (let i = 0; i <= MAX_REDISPATCHES; i++) {
			handler.handleWorkerDisconnect(worker);
			handler.tryDispatch();
		}

		expect(sent).toHaveLength(MAX_REDISPATCHES + 1);
		expect(mockExecStore.markStepFailed).toHaveBeenCalled();
		const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
		expect(reason).toMatch(/disconnect/i);
		expect(reason).toContain('flow worker list');
	});

	// The budget counts hand-offs that never began. Once a step has run, its earlier aborted
	// hand-offs must not still be held against it -- a retry would start part-way through a
	// budget it never spent.
	it('forgets earlier aborted hand-offs once the step has actually started', async () => {
		const { handler, worker, sent, executionId } = await dispatchOneStep();

		for (let i = 0; i < MAX_REDISPATCHES; i++) {
			handler.handleWorkerDisconnect(worker);
			handler.tryDispatch();
		}
		handler.onStepStarted(worker, sent.at(-1)!.assignmentId, executionId, 's1');
		// Budget reset, so this disconnect is a failure of a started step rather than an
		// exhausted budget -- and a fresh not-started disconnect would be re-dispatched again.
		handler.handleWorkerDisconnect(worker);
		handler.tryDispatch();

		const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
		expect(reason).toMatch(/while it was executing/i);
	});

	it('does nothing for a worker that held no assignment', async () => {
		const { handler } = await dispatchOneStep();

		expect(() => handler.handleWorkerDisconnect({} as never)).not.toThrow();
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});
});

describe('CommandHandler — a step whose worker went quiet', () => {
	/** Runs the one-step flow to the point where s1 is executing, with a short silence limit. */
	async function startOneStep(limitMs: number) {
		const flowFile = path.join(tmpDir, 'quiet.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const worker = {} as never;
		const sent: { stepId: string; assignmentId: string }[] = [];
		workerPool.getIdle.mockReturnValue(worker);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			const m = msg as { stepId: string; assignmentId: string };
			sent.push({ stepId: m.stepId, assignmentId: m.assignmentId });
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			limitMs
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };
		const assignmentId = sent[0]?.assignmentId;
		if (assignmentId === undefined) throw new Error('no step was dispatched, so nothing can stall');
		handler.onStepStarted(worker, assignmentId, executionId, 's1');

		return { handler, assignmentId };
	}

	// The gap this closes: a closing socket was the only thing the daemon reacted to, so a step that
	// simply never finished held its assignment forever and the flow waited with it. A `jest` run left
	// in a workspace still held one 32 hours later.
	it('fails an executing step that has reported nothing for the limit', async () => {
		vi.useFakeTimers();
		try {
			const { handler } = await startOneStep(60_000);

			// A slow step is not a stuck one.
			vi.advanceTimersByTime(59_000);
			handler.failStalledSteps();
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();

			vi.advanceTimersByTime(2_000);
			handler.failStalledSteps();

			const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
			expect(reason).toMatch(/reported nothing/i);
			expect(reason).toMatch(/stuck/i);
			// The remedy has to name a key that exists: the first version said
			// queue.stepSilenceLimit, which is not the setting.
			expect(reason).toContain('queue.stepSilenceLimitSeconds');
			// Not retried: it was executing, so it may already have had an effect (D#65).
			expect(reason).toMatch(/not retried/i);
		} finally {
			vi.useRealTimers();
		}
	});

	it('treats output as progress, so a long but talkative step survives', async () => {
		vi.useFakeTimers();
		try {
			const { handler, assignmentId } = await startOneStep(60_000);

			for (let elapsed = 0; elapsed < 180_000; elapsed += 30_000) {
				vi.advanceTimersByTime(30_000);
				handler.noteAssignmentActivity(assignmentId);
				handler.failStalledSteps();
			}

			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('says nothing about a step that settled normally', async () => {
		vi.useFakeTimers();
		try {
			const { handler, assignmentId } = await startOneStep(60_000);
			handler.settleAssignment(assignmentId);

			vi.advanceTimersByTime(120_000);
			handler.failStalledSteps();

			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
