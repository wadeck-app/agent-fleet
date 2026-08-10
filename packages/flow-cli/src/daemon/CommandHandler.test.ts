import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { AssignableStep, ClientCommand, ExecutionContext } from '../ipc/Protocol.js';
import { ExecutionStore } from '../storage/ExecutionStore.js';
import { LogWriter } from '../storage/LogWriter.js';
import { StepQueue } from './StepQueue.js';
import { CommandHandler } from './CommandHandler.js';
import type { WorkerPool } from './WorkerPool.js';

function makeMinimalFlowYaml(overrides: string = ''): string {
	return `
id: test-flow
version: '1.0.0'
name: Test Flow
description: Minimal test flow
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: step1
    name: Step 1
    type: script
    script: echo hello
${overrides}`.trim();
}

function makeMockWorkerPool(): WorkerPool {
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
	} as unknown as WorkerPool;
}

function makeRunCommand(flowFile: string, overrides?: Partial<Extract<ClientCommand, { type: 'run' }>>): Extract<ClientCommand, { type: 'run' }> {
	return {
		type: 'run',
		flowFile,
		cwd: process.cwd(),
		inputs: {},
		...overrides,
	};
}

let tmpDir: string;
let executionsDir: string;
let logsDir: string;

beforeEach(() => {
	tmpDir = path.join(os.tmpdir(), `cmd-handler-test-${crypto.randomUUID()}`);
	executionsDir = path.join(tmpDir, 'executions');
	logsDir = path.join(tmpDir, 'logs');
	fs.mkdirSync(executionsDir, { recursive: true });
	fs.mkdirSync(logsDir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CommandHandler.handleRun', () => {
	it('returns FLOW_NOT_FOUND when flow file does not exist', async () => {
		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const result = await handler.handleRun(makeRunCommand('/nonexistent/path/flow.yml'));
		expect(result.type).toBe('error');
		if (result.type === 'error') {
			expect(result.code).toBe('FLOW_NOT_FOUND');
		}
	});

	it('returns PARSE_ERROR when file content is not valid YAML', async () => {
		const flowFile = path.join(tmpDir, 'bad.yml');
		fs.writeFileSync(flowFile, 'invalid: yaml: [unclosed\n');

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const result = await handler.handleRun(makeRunCommand(flowFile));
		expect(result.type).toBe('error');
		if (result.type === 'error') {
			expect(result.code).toBe('PARSE_ERROR');
		}
	});

	it('returns PARSE_ERROR when flow file is empty', async () => {
		const flowFile = path.join(tmpDir, 'empty.yml');
		fs.writeFileSync(flowFile, '');

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const result = await handler.handleRun(makeRunCommand(flowFile));
		expect(result.type).toBe('error');
		if (result.type === 'error') {
			expect(result.code).toBe('PARSE_ERROR');
		}
	});

	it('returns error (not crash) for a flow without workspace key', async () => {
		// The schema validator requires workspace, so a flow missing it returns VALIDATION_FAILED
		// rather than crashing in DeclaredWorkspaceProvider. The guard in handleRun (flow.workspace check)
		// protects against cases where a flow object with undefined workspace passes validation in the future.
		const flowFile = path.join(tmpDir, 'no-workspace.yml');
		fs.writeFileSync(flowFile, `
id: test-flow
version: '1.0.0'
name: Test Flow
description: Flow with no workspace
inputs: {}
steps:
  - id: step1
    name: Step 1
    type: script
    script: echo hello
`.trim());

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		// Must return an error response, not throw
		const result = await handler.handleRun(makeRunCommand(flowFile));
		expect(result.type).toBe('error');
	});

	it('returns VALIDATION_FAILED when flow has schema validation errors', async () => {
		const flowFile = path.join(tmpDir, 'invalid.yml');
		// Missing required fields (empty steps list is invalid)
		fs.writeFileSync(flowFile, `
id: bad-flow
version: '1.0.0'
name: Bad Flow
description: Invalid flow
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps: []
`.trim());

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const result = await handler.handleRun(makeRunCommand(flowFile));
		expect(result.type).toBe('error');
		if (result.type === 'error') {
			expect(result.code).toBe('VALIDATION_FAILED');
		}
	});

	it('returns UNSUPPORTED_STEP_TYPE when flow has user_intervention step', async () => {
		const flowFile = path.join(tmpDir, 'with-intervention.yml');
		fs.writeFileSync(flowFile, `
id: test-flow
version: '1.0.0'
name: Test Flow
description: Flow with user intervention
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: step1
    name: Step 1
    type: script
    script: echo hello
  - id: approve
    name: Approval
    type: user_intervention
    interventionType: approval
    approval:
      title: Please approve
    depends:
      - step1
`.trim());

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const result = await handler.handleRun(makeRunCommand(flowFile));
		expect(result.type).toBe('error');
		if (result.type === 'error') {
			expect(result.code).toBe('UNSUPPORTED_STEP_TYPE');
		}
	});

	it('returns execution_started for a valid flow file', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, makeMinimalFlowYaml());

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const result = await handler.handleRun(makeRunCommand(flowFile));
		expect(result.type).toBe('execution_started');
		if (result.type === 'execution_started') {
			expect(result.executionId).toMatch(/^[a-z0-9]{8}$/);
		}
	});

	it('enqueues steps into the step queue on valid flow', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, makeMinimalFlowYaml());

		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		await handler.handleRun(makeRunCommand(flowFile));
		// The step queue should have steps ready (step1 has no dependencies)
		expect(stepQueue.isEmpty()).toBe(false);
	});
});

describe('CommandHandler.tryDispatch', () => {
	it('does nothing when queue is empty', () => {
		const stepQueue = new StepQueue();
		const workerPool = makeMockWorkerPool();
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		// Should not throw; no steps in queue
		expect(() => handler.tryDispatch()).not.toThrow();
		expect((workerPool.getIdleWorker as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(0);
	});

	it('sends assign message to idle worker when queue has steps', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, makeMinimalFlowYaml());

		const stepQueue = new StepQueue();
		const mockWs = { readyState: 1, send: vi.fn(), OPEN: 1 } as unknown as WebSocket;
		const workerPool = {
			...makeMockWorkerPool(),
			getIdleWorker: vi.fn().mockReturnValueOnce(mockWs).mockReturnValue(undefined),
			canSpawn: vi.fn().mockReturnValue(false),
			markBusy: vi.fn(),
			sendToWorker: vi.fn(),
		} as unknown as WorkerPool;

		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		// Enqueue the flow first (this also calls tryDispatch internally)
		// but we want to test tryDispatch explicitly, so enqueue manually
		const context: ExecutionContext = {
			executionId: 'abc12345',
			inputs: {},
			stepOutputs: {},
			workspaceDir: tmpDir,
		};
		const step: AssignableStep = { id: 'step1', name: 'Step 1', type: 'script', script: 'echo hello' };
		stepQueue.enqueueExecution(context, [step], new Map([['step1', []]]));

		// Dequeue the step that was auto-queued, then test tryDispatch
		stepQueue.dequeue(); // drain auto-enqueued step

		// Re-enqueue fresh
		const context2: ExecutionContext = {
			executionId: 'def56789',
			inputs: {},
			stepOutputs: {},
			workspaceDir: tmpDir,
		};
		executionStore.create({
			executionId: 'def56789',
			flowFile,
			flowId: 'test-flow',
			stepIds: ['step1'],
		});
		stepQueue.enqueueExecution(context2, [step], new Map([['step1', []]]));

		handler.tryDispatch();

		expect(workerPool.markBusy).toHaveBeenCalledWith(mockWs);
		expect(workerPool.sendToWorker).toHaveBeenCalledWith(
			mockWs,
			expect.objectContaining({ type: 'assign', stepId: 'step1' })
		);
	});

	it('spawns a new worker when queue has steps but no idle workers', async () => {
		const flowFile = path.join(tmpDir, 'valid.yml');
		fs.writeFileSync(flowFile, makeMinimalFlowYaml());

		const stepQueue = new StepQueue();
		const workerPool = {
			...makeMockWorkerPool(),
			getIdleWorker: vi.fn().mockReturnValue(undefined),
			canSpawn: vi.fn().mockReturnValue(true),
			spawnWorker: vi.fn(),
		} as unknown as WorkerPool;

		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir);
		const handler = new CommandHandler(tmpDir, stepQueue, workerPool, undefined, executionStore, logWriter);

		const context: ExecutionContext = {
			executionId: 'abc12345',
			inputs: {},
			stepOutputs: {},
			workspaceDir: tmpDir,
		};
		const step: AssignableStep = { id: 'step1', name: 'Step 1', type: 'script', script: 'echo hello' };
		executionStore.create({
			executionId: 'abc12345',
			flowFile,
			flowId: 'test-flow',
			stepIds: ['step1'],
		});
		stepQueue.enqueueExecution(context, [step], new Map([['step1', []]]));

		handler.tryDispatch();

		expect(workerPool.spawnWorker).toHaveBeenCalled();
	});
});
