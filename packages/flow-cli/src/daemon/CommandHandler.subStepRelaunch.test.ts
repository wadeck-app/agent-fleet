import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { WORKER_FEATURE_SUB_STEP_SESSION_RESUME } from '../ipc/Protocol';
import { CommandHandler } from './CommandHandler';
import { registerFolderAsProject } from './CommandHandlerTestHarness';

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

const FLOW_YAML = `\
id: relaunch-flow
version: "1.0.0"
name: Relaunch
description: parent with a sub-step
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: parent
    name: Parent
    type: model
    provider: opencode
    prompt: ORIGINAL
`;

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
	pruneOldExecutions: vi.fn(),
	update: vi.fn(),
};
const mockLogWriter = { write: vi.fn(), writeExecution: vi.fn() };

const idleSocket = {};

function createPool(features: string[]) {
	const pool = {
		describe: vi
			.fn()
			.mockReturnValue({ workerId: 'w-test', sourceId: 'built-in:fork', version: '9.9.9', features }),
		remove: vi.fn(),
		getIdle: vi.fn().mockReturnValue(idleSocket),
		listIdle: vi.fn(() => [
			{
				ws: idleSocket,
				worker: {
					state: 'idle',
					workerId: 'w-test',
					pid: 1,
					labels: [] as string[],
					attachedProjects: [] as string[],
					attachedProjectIds: [] as string[],
					hasUserInterface: false,
					ephemeral: true,
					shellCapabilities: [] as string[],
					features,
				},
			},
		]),
		markBusy: vi.fn(),
		markIdle: vi.fn(),
		hasBusyWorkers: vi.fn().mockReturnValue(false),
		send: vi.fn().mockReturnValue(true),
		broadcast: vi.fn(),
		register: vi.fn(),
		canProvision: vi.fn().mockReturnValue(false),
		planProvisioning: vi.fn().mockReturnValue({ fork: 0 }),
		provision: vi.fn().mockResolvedValue(undefined),
		registerWorker: vi.fn().mockReturnValue(true),
	};
	return pool;
}

let tmpDir: string;
let disposeProject: () => void;
let daemonDir: string;

beforeEach(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-handler-relaunch-'));
	daemonDir = path.join(tmpDir, 'daemon');
	({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
	fs.mkdirSync(daemonDir, { recursive: true });
	vi.clearAllMocks();
	mockExecStore.read.mockReturnValue({ steps: {} });
	mockExecStore.exists.mockReturnValue(false);
});

afterEach(() => {
	disposeProject();
	vi.restoreAllMocks();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

type Assign = { type: string; stepId: string; executionContext: Record<string, unknown> };

function assignsSent(pool: ReturnType<typeof createPool>): Assign[] {
	return pool.send.mock.calls.map(call => call[1] as Assign).filter(message => message.type === 'assign');
}

async function startFlow(
	pool: ReturnType<typeof createPool>
): Promise<{ handler: CommandHandler; executionId: string }> {
	const handler = new CommandHandler(
		daemonDir,
		pool as never,
		pool as never,
		undefined,
		mockExecStore as never,
		mockLogWriter as never
	);
	const flowFile = path.join(tmpDir, 'relaunch-flow.yml');
	fs.writeFileSync(flowFile, FLOW_YAML);
	const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	expect(result.type).toBe('execution_started');
	return { handler, executionId: (result as { executionId: string }).executionId };
}

const CHILD = { id: 'child', name: 'Child', type: 'script', script: 'echo x', parent: 'parent' } as never;
const PARENT_META = { model: 'm', session_id: 'ses_first', session_file: '' };

describe('CommandHandler -- dispatch of a parent restarted because a sub-step failed', () => {
	it('sends the failed sub-step feedback with the restarted parent, and nothing on the first launch', async () => {
		const pool = createPool([WORKER_FEATURE_SUB_STEP_SESSION_RESUME]);
		const { handler, executionId } = await startFlow(pool);
		handler.tryDispatch();
		handler.injectSteps(executionId, [CHILD]);
		handler.onStepCompleted(executionId, 'parent', { rawOutput: 'x' }, PARENT_META as never);
		handler.tryDispatch();
		handler.onStepFailed(executionId, 'child', 'Script exited with code 1', { stderr: 'E1', stdout: 'out' });

		const assigns = assignsSent(pool);
		const parents = assigns.filter(a => a.stepId === 'parent');
		expect(parents).toHaveLength(2);
		expect(parents[0]?.executionContext['subStepRelaunch']).toBeUndefined();
		expect(parents[1]?.executionContext['subStepRelaunch']).toEqual({ feedback: '[child]\nE1' });
		// what the worker needs to resume: the session id captured on the first run
		expect((parents[1]?.executionContext['stepMeta'] as Record<string, unknown>)['parent']).toMatchObject({
			session_id: 'ses_first',
		});
	});

	it('does not leak the relaunch payload to the sub-step re-dispatched alongside the parent', async () => {
		const pool = createPool([WORKER_FEATURE_SUB_STEP_SESSION_RESUME]);
		const { handler, executionId } = await startFlow(pool);
		handler.tryDispatch();
		handler.injectSteps(executionId, [CHILD]);
		handler.onStepCompleted(executionId, 'parent', {}, PARENT_META as never);
		handler.tryDispatch();
		handler.onStepFailed(executionId, 'child', 'boom', { stderr: 'E1' });

		for (const assign of assignsSent(pool).filter(a => a.stepId === 'child')) {
			expect(assign.executionContext['subStepRelaunch']).toBeUndefined();
		}
	});

	it('does not stick to the shared execution context: the payload is per dispatch', async () => {
		const pool = createPool([WORKER_FEATURE_SUB_STEP_SESSION_RESUME]);
		const { handler, executionId } = await startFlow(pool);
		handler.tryDispatch();
		handler.injectSteps(executionId, [CHILD]);
		handler.onStepCompleted(executionId, 'parent', {}, PARENT_META as never);
		handler.tryDispatch();
		handler.onStepFailed(executionId, 'child', 'boom', { stderr: 'E1' });
		// parent relaunch completes (child, injected again, would validate it)
		handler.onStepCompleted(executionId, 'parent', {}, PARENT_META as never);
		handler.tryDispatch();

		const parents = assignsSent(pool).filter(a => a.stepId === 'parent');
		expect(parents.filter(p => p.executionContext['subStepRelaunch'] !== undefined)).toHaveLength(1);
	});

	it('warns explicitly in the execution log when the worker predates session resume', async () => {
		const pool = createPool([]);
		const { handler, executionId } = await startFlow(pool);
		handler.tryDispatch();
		handler.injectSteps(executionId, [CHILD]);
		handler.onStepCompleted(executionId, 'parent', {}, PARENT_META as never);
		handler.tryDispatch();
		handler.onStepFailed(executionId, 'child', 'boom', { stderr: 'E1' });

		const warnings = mockLogWriter.writeExecution.mock.calls.filter(call => call[2] === 'warning');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.[0]).toBe(executionId);
		expect(String(warnings[0]?.[1])).toContain("'parent'");
		expect(String(warnings[0]?.[1])).toContain('9.9.9');
		expect(String(warnings[0]?.[1])).toContain('update');
	});

	it('still fails the execution terminally after maxSubStepIterations', async () => {
		const pool = createPool([WORKER_FEATURE_SUB_STEP_SESSION_RESUME]);
		const { handler, executionId } = await startFlow(pool);
		// default is 3 re-runs: the 4th failure is terminal
		for (let i = 0; i < 4; i++) {
			handler.tryDispatch();
			handler.injectSteps(executionId, [{ ...(CHILD as object), id: `child-${String(i)}` } as never]);
			handler.onStepCompleted(executionId, 'parent', {}, PARENT_META as never);
			handler.tryDispatch();
			handler.onStepFailed(executionId, `child-${String(i)}`, 'boom', { stderr: 'E' });
		}

		expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
		expect(handler.hasActiveExecutions()).toBe(false);
	});
});
