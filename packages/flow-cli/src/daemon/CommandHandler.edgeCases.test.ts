import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CommandHandler } from './CommandHandler';

// Characterization tests written before CommandHandler was split into collaborators: they pin the
// behaviour of paths the other CommandHandler test files do not reach.

const startedHandlers: CommandHandler[] = [];

class TrackedCommandHandler extends CommandHandler {
	constructor(...args: ConstructorParameters<typeof CommandHandler>) {
		super(...args);
		startedHandlers.push(this);
	}
}

const { mockAllocate, mockRelease } = vi.hoisted(() => ({
	mockAllocate: vi.fn(),
	mockRelease: vi.fn(),
}));

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

const FLOW_WITH_GLOBAL_ENV = `\
id: env-flow
version: "1.0.0"
name: Env Flow
description: Test
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
env:
  FROM_FLOW: "cwd=\${{ context.cwd }}"
  SHARED: flow-value
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
    env:
      SHARED: step-value
`;

const TWO_STEP_FLOW = `\
id: two
version: "1.0.0"
name: Two
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
  - id: s2
    name: S2
    type: script
    script: echo world
    depends:
      - s1
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
	markStepsPending: vi.fn(),
	markExecutionCompleted: vi.fn(),
	markExecutionFailed: vi.fn(),
	markExecutionResumed: vi.fn(),
	pruneOldExecutions: vi.fn(),
	update: vi.fn(),
};

const mockLogWriter = {
	write: vi.fn(),
	writeExecution: vi.fn(),
};

function createWorkerPool(idle: boolean) {
	const pool = {
		describe: vi.fn().mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork' }),
		remove: vi.fn(),
		listIdle: vi.fn((): unknown[] =>
			idle
				? [
						{
							ws: {},
							worker: {
								state: 'idle',
								workerId: 'w-test',
								pid: 1,
								labels: [] as string[],
								attachedProjects: [] as string[],
								hasUserInterface: false,
								ephemeral: true,
								shellCapabilities: [] as string[],
							},
						},
					]
				: []
		),
		markBusy: vi.fn(),
		markIdle: vi.fn(),
		disconnect: vi.fn(),
		send: vi.fn().mockReturnValue(true),
		summarize: vi.fn().mockReturnValue([]),
		planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		provision: vi.fn().mockResolvedValue(undefined),
	};
	return pool;
}

function makeHandler(
	pool = createWorkerPool(false),
	extra: { hookDispatcher?: unknown; workspaceProvider?: unknown } = {}
): CommandHandler {
	return new TrackedCommandHandler(
		daemonDir,
		pool as never,
		pool as never,
		extra.hookDispatcher as never,
		mockExecStore as never,
		mockLogWriter as never,
		false,
		20,
		3,
		extra.workspaceProvider as never
	);
}

async function startFlow(handler: CommandHandler, yaml: string): Promise<string> {
	const flowFile = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(flowFile, yaml);
	const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	if (result.type !== 'execution_started') {
		throw new Error(`Expected execution_started, got ${JSON.stringify(result)}`);
	}
	return result.executionId;
}

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-edge-'));
	daemonDir = path.join(tmpDir, 'daemon');
	fs.mkdirSync(daemonDir, { recursive: true });
	vi.clearAllMocks();
	mockAllocate.mockResolvedValue({
		path: '/tmp/test-workspace',
		id: 'ws-test-id',
		metaDir: '/tmp/test-workspace.meta',
	});
	mockRelease.mockResolvedValue(undefined);
	mockExecStore.exists.mockReturnValue(false);
	mockExecStore.read.mockReturnValue({ steps: {} });
});

afterEach(() => {
	for (const handler of startedHandlers.splice(0)) {
		handler.stopBackgroundWork();
	}
	vi.restoreAllMocks();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CommandHandler run setup edge cases', () => {
	it('renders the flow-level env with context templates and lets a step override it', async () => {
		const pool = createWorkerPool(true);
		const handler = makeHandler(pool);

		await startFlow(handler, FLOW_WITH_GLOBAL_ENV);

		const assign = pool.send.mock.calls[0]![1] as { stepConfig: { env: Record<string, string> } };
		expect(assign.stepConfig.env).toEqual({ FROM_FLOW: `cwd=${tmpDir}`, SHARED: 'step-value' });
	});

	it('refuses the run with WORKSPACE_ERROR when the native workspace cannot be allocated', async () => {
		mockAllocate.mockRejectedValue(new Error('disk full'));
		const handler = makeHandler();
		const flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, TWO_STEP_FLOW);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result).toEqual({
			type: 'error',
			code: 'WORKSPACE_ERROR',
			message: 'Failed to allocate workspace. Ensure the flow workspace directory is writable.',
		});
		expect(mockLogWriter.writeExecution).toHaveBeenCalledWith(
			'__workspace',
			expect.stringContaining('WORKSPACE_ERROR detail: Error: disk full'),
			'error'
		);
		expect(mockExecStore.create).not.toHaveBeenCalled();
	});

	it('refuses the run with WORKSPACE_ERROR when the plugin provider cannot allocate', async () => {
		const provider = { allocate: vi.fn().mockRejectedValue(new Error('quota')), release: vi.fn() };
		const handler = makeHandler(createWorkerPool(false), { workspaceProvider: provider });
		const flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, TWO_STEP_FLOW);

		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(result).toEqual({
			type: 'error',
			code: 'WORKSPACE_ERROR',
			message: 'Failed to allocate workspace via plugin provider.',
		});
		expect(mockExecStore.create).not.toHaveBeenCalled();
	});

	it('releases the plugin workspace and rethrows when recording the execution fails', async () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const release = vi.fn().mockRejectedValue(new Error('release broke'));
		const provider = { allocate: vi.fn().mockResolvedValue({ id: 'h', path: tmpDir }), release };
		mockExecStore.create.mockImplementation(() => {
			throw new Error('store broke');
		});
		const handler = makeHandler(createWorkerPool(false), { workspaceProvider: provider });
		const flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, TWO_STEP_FLOW);

		await expect(handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never)).rejects.toThrow('store broke');
		await vi.waitFor(() => {
			expect(release).toHaveBeenCalledOnce();
			expect(stderr).toHaveBeenCalledWith(
				expect.stringContaining('Failed to release workspace after setup error')
			);
		});
	});

	it('reports a failure to release the native workspace when the execution ends', async () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		mockRelease.mockRejectedValue(new Error('cannot release'));
		const handler = makeHandler();
		const executionId = await startFlow(handler, TWO_STEP_FLOW);

		handler.onStepCompleted(executionId, 's1', {});
		handler.onStepCompleted(executionId, 's2', {});

		await vi.waitFor(() => {
			expect(stderr).toHaveBeenCalledWith(
				expect.stringContaining(`Failed to release workspace for ${executionId}`)
			);
		});
	});
});

describe('CommandHandler step outcome edge cases', () => {
	it('ignores a completed report for an execution that no longer exists', () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const handler = makeHandler();

		handler.onStepCompleted('gone', 's1', {});

		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining('onStepCompleted: no scheduler for execution gone')
		);
	});

	it('marks the steps the scheduler skipped as completed when the execution ends', async () => {
		const handler = makeHandler();
		const executionId = await startFlow(handler, TWO_STEP_FLOW);
		mockExecStore.exists.mockReturnValue(true);
		mockExecStore.read.mockReturnValue({ steps: { s1: { status: 'completed' }, s2: { status: 'pending' } } });

		handler.onStepCompleted(executionId, 's1', {});
		handler.onStepCompleted(executionId, 's2', {});

		expect(mockExecStore.markStepCompleted).toHaveBeenCalledWith(executionId, 's2');
		expect(mockExecStore.markStepCompleted).not.toHaveBeenCalledWith(executionId, 's1');
	});

	it('reports a failing hook in the execution log instead of throwing', async () => {
		const hookDispatcher = {
			dispatch: vi.fn((_event: string, _payload: unknown, onError: (err: unknown) => void) => {
				onError(new Error('hook broke'));
				return Promise.resolve();
			}),
		};
		const handler = makeHandler(createWorkerPool(false), { hookDispatcher });
		const flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, TWO_STEP_FLOW);

		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never, hookDispatcher as never);

		expect(mockLogWriter.writeExecution).toHaveBeenCalledWith(
			'__hook',
			expect.stringContaining("Hook 'onFlowStart' failed: Error: hook broke"),
			'error'
		);
	});
});

describe('CommandHandler assignment verification', () => {
	it('rejects reports that name no outstanding assignment', () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const handler = makeHandler();
		const worker = {} as never;

		expect(handler.verifyAssignment(worker, 'nope', 'e1', 's1')).toBe(false);
		expect(handler.verifyAssignmentScope(worker, 'nope', 'e1')).toBe(false);
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining('rejected worker report'));
	});
});

describe('CommandHandler step injection validation', () => {
	const child = (id: string, extra: Record<string, unknown> = {}) =>
		({ id, name: id, type: 'script', script: 'echo', ...extra }) as never;

	it('refuses an injection for an execution that is not running', () => {
		expect(() => makeHandler().injectSteps('gone', [child('c1')])).toThrow(
			'No active execution found for id: gone'
		);
	});

	it('refuses a batch over the per-call limit', async () => {
		const handler = makeHandler();
		const executionId = await startFlow(handler, TWO_STEP_FLOW);
		const batch = Array.from({ length: 21 }, (_, i) => child(`c${String(i)}`));

		expect(() => handler.injectSteps(executionId, batch)).toThrow('exceeds per-call limit of 20');
	});

	it('refuses an unknown parent and an unknown dependency', async () => {
		const handler = makeHandler();
		const executionId = await startFlow(handler, TWO_STEP_FLOW);

		expect(() => handler.injectSteps(executionId, [child('c1', { parent: 'missing' })])).toThrow(
			"Parent step 'missing' does not exist"
		);
		expect(() => handler.injectSteps(executionId, [child('c2', { depends: ['missing'] })])).toThrow(
			"Dependency step 'missing' does not exist"
		);
	});

	it('refuses to re-inject a step that is in flight', async () => {
		const pool = createWorkerPool(true);
		const handler = makeHandler(pool);
		const executionId = await startFlow(handler, TWO_STEP_FLOW);

		expect(() => handler.injectSteps(executionId, [child('s1')])).toThrow("Step id 's1' is currently in-flight");
	});

	it('refuses an injection that would exceed the per-execution step limit', async () => {
		const handler = makeHandler();
		const executionId = await startFlow(handler, TWO_STEP_FLOW);

		expect(() => handler.injectSteps(executionId, [child('c1'), child('c2')])).toThrow(
			'would exceed max steps per execution (3)'
		);
	});
});
