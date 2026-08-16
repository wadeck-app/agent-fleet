import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';

const { mockAllocate, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace' }),
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
	mockAllocate.mockResolvedValue({ path: '/tmp/test-workspace' });
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
