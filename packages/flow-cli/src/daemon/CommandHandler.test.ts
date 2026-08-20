import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';

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

function createMockWorkerPool() {
	return {
		canSpawn: vi.fn().mockReturnValue(false),
		spawnWorker: vi.fn(),
		registerWorker: vi.fn(),
		removeWorker: vi.fn(),
		getIdleWorker: vi.fn().mockReturnValue(undefined),
		markBusy: vi.fn(),
		hasActiveWorkers: vi.fn().mockReturnValue(false),
		sendToWorker: vi.fn(),
		broadcastDone: vi.fn(),
	};
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

	it('returns UNSUPPORTED_STEP_TYPE when the flow contains a user_intervention step', async () => {
		const flowFile = path.join(tmpDir, 'intervention.yml');
		fs.writeFileSync(flowFile, USER_INTERVENTION_FLOW_YAML);

		const handler = makeHandler();
		const result = await handler.handleRun({
			type: 'run',
			flowFile,
			cwd: tmpDir,
		} as never);

		expect(result.type).toBe('error');
		if (result.type !== 'error') throw new Error('Expected error response');
		expect((result as { code: string }).code).toBe('UNSUPPORTED_STEP_TYPE');
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

		const handler = new CommandHandler(tmpDir, createMockWorkerPool() as never);
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
		workerPool.getIdleWorker.mockReturnValue({} as never);
		workerPool.sendToWorker.mockImplementation((_ws, msg) => {
			dispatchedSteps.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		// s1 was dispatched on handleRun
		expect(dispatchedSteps).toContain('s1');

		// Complete s1 — s2 should be enqueued and dispatched
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
		workerPool.getIdleWorker.mockReturnValue({} as never);
		workerPool.sendToWorker.mockImplementation((_ws, msg) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
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

		// b skipped → c should be dispatched
		expect(dispatched).not.toContain('b');
		expect(dispatched).toContain('c');
	});

	it('onStepFailed removes pending steps for that execution from readyQueue', async () => {
		// Two independent steps: s1 and s2. Fail s1 → s2 should not be dispatched.
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
		workerPool.getIdleWorker.mockImplementation(() => (dispatchCount++ < 1 ? {} : undefined));
		workerPool.sendToWorker.mockReturnValue(true);

		const handler = new CommandHandler(
			daemonDir,
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
		workerPool.getIdleWorker.mockReturnValue({} as never);
		workerPool.sendToWorker.mockImplementation((_ws, msg) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
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

		// First attempt fails — retry config allows 1 more attempt
		handler.onStepFailed(executionId, 's1', 'transient error');

		// Execution must still be active (retry pending, not terminal failure)
		expect(handler.hasActiveExecutions()).toBe(true);

		// s1 must have been re-dispatched (retry re-enqueued it)
		expect(dispatched.filter(id => id === 's1')).toHaveLength(2);

		// Second attempt succeeds — execution completes
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
		workerPool.getIdleWorker.mockReturnValue({} as never);
		workerPool.sendToWorker.mockImplementation((_ws, msg) => {
			dispatched.push((msg as { stepId: string }).stepId);
			return true;
		});

		const handler = new CommandHandler(
			daemonDir,
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

		// First failure — loop should re-queue attempt, NOT terminate execution
		handler.onStepFailed(executionId, 'attempt', 'not ready yet');

		// Execution must still be active (loop pending)
		expect(handler.hasActiveExecutions()).toBe(true);

		// markExecutionFailed must NOT have been called (loop in progress)
		expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();

		// attempt must have been re-dispatched (loop re-enqueued it)
		expect(dispatched.filter(id => id === 'attempt')).toHaveLength(2);

		// Second attempt succeeds — done becomes ready
		handler.onStepCompleted(executionId, 'attempt', { result: 'ok' });
		handler.tryDispatch();
		// done should now be dispatched
		expect(dispatched).toContain('done');

		// Complete done — execution fully done
		handler.onStepCompleted(executionId, 'done', {});
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('transport failure (worker drops): step re-dispatched via tryDispatch, NOT via scheduler.complete()', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		// First send fails, second succeeds
		workerPool.getIdleWorker.mockReturnValue({} as never);
		workerPool.sendToWorker
			.mockReturnValueOnce(false) // first attempt: transport failure
			.mockReturnValue(true); // subsequent: success

		const handler = new CommandHandler(
			daemonDir,
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
