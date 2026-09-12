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

function createMockWorkerPool() {
	return {
		canSpawn: vi.fn().mockReturnValue(false),
		spawnWorker: vi.fn(),
		registerWorker: vi.fn(),
		removeWorker: vi.fn(),
		getIdleWorker: vi.fn().mockReturnValue(undefined),
		markBusy: vi.fn(),
		hasActiveWorkers: vi.fn().mockReturnValue(false),
		sendToWorker: vi.fn().mockReturnValue(true),
		broadcastDone: vi.fn(),
	};
}

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

			// Parent completes — but child1 is still pending, so execution must remain active
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

			// Parent completes — deferred because child1 is still pending
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });
			expect(handler.hasActiveExecutions()).toBe(true);

			// Child completes — should fire parent's deferred completion → execution ends
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

			// Parent completes — deferred because child1 is still pending
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });
			expect(handler.hasActiveExecutions()).toBe(true);

			// Child fails — parent should be re-queued (not execution failed)
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

			// Iteration 1: parent runs → inject child → child fails → parent re-queued (1 <= 1)
			handler.injectSteps(executionId, [
				{ id: 'child-0', type: 'script', script: 'echo x', parent: 'parent' } as never,
			]);
			handler.onStepCompleted(executionId, 'parent', { result: 'parent done' });
			handler.onStepFailed(executionId, 'child-0', 'err-0');
			expect(handler.hasActiveExecutions()).toBe(true);
			expect(mockExecStore.markExecutionFailed).not.toHaveBeenCalled();

			// Iteration 2: parent re-runs → inject child → child fails → 2 > 1 → parent fails
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

			// First injection — should succeed
			expect(() => handler.injectSteps(executionId, [subStep])).not.toThrow();

			// Second injection of the same step (loop re-run) — must be a no-op, not throw
			expect(() => handler.injectSteps(executionId, [subStep])).not.toThrow();

			// Execution still active
			expect(handler.hasActiveExecutions()).toBe(true);
		});
	});
});
