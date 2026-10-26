import * as fs from 'node:fs';
import * as path from 'node:path';

import {
	TrackedCommandHandler,
	VALID_FLOW_YAML,
	createMockWorkerPool,
	daemonDir,
	forkedWorker,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';
import type { DaemonRuntime } from './DaemonRuntime';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';

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

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

const PARALLEL_FLOW_YAML = `\
id: parallel-flow
version: "1.0.0"
name: Parallel Flow
description: Two independent steps
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo one
  - id: s2
    name: S2
    type: script
    script: echo two
`;

const PARALLEL_INTERVENTION_FLOW_YAML = `\
id: parallel-intervention-flow
version: "1.0.0"
name: Parallel Intervention Flow
description: A script and an approval, independent
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
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    approval:
      title: Approve
      description: Please review
`;

const TIMEOUT_ERROR = 'No decision was made -- this step is unanswered, not denied.';

interface Sent {
	ws: object;
	stepId: string;
	assignmentId: string;
}

/** A pool whose idle workers are explicit, so each parallel step lands on its own fake worker. */
function createFakeFleet(options: { interactive?: boolean } = {}) {
	const pool = createMockWorkerPool();
	const idle = new Set<object>();
	const sent: Sent[] = [];
	const addWorker = (): object => {
		const ws = {};
		idle.add(ws);
		return ws;
	};
	pool.listIdle.mockImplementation(() =>
		[...idle].map(ws => {
			const registered = forkedWorker(ws);
			registered.worker.hasUserInterface = options.interactive === true;
			return registered;
		})
	);
	pool.markBusy.mockImplementation((ws: object) => {
		idle.delete(ws);
	});
	pool.send.mockImplementation((ws: object, msg: unknown) => {
		const m = msg as { stepId: string; assignmentId: string };
		sent.push({ ws, stepId: m.stepId, assignmentId: m.assignmentId });
		return true;
	});
	return { pool, sent, addWorker };
}

function newHandler(pool: ReturnType<typeof createMockWorkerPool>): TrackedCommandHandler {
	return new TrackedCommandHandler(
		daemonDir,
		pool as never,
		pool as never,
		undefined,
		mockExecStore as never,
		mockLogWriter as never
	);
}

async function startFlow(handler: TrackedCommandHandler, yaml: string): Promise<string> {
	const flowFile = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(flowFile, yaml);
	const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	if (result.type !== 'execution_started') {
		throw new Error(`run was refused: ${JSON.stringify(result)}`);
	}
	return (result as { executionId: string }).executionId;
}

describe('CommandHandler -- after a terminal failure, a sibling step assigned but not started', () => {
	/** s1 started on worker A and fails terminally; s2 is assigned to worker B, which has not confirmed starting it. */
	async function failWhileSiblingIsAssigned() {
		const fleet = createFakeFleet();
		const workerA = fleet.addWorker();
		const workerB = fleet.addWorker();
		const handler = newHandler(fleet.pool);
		const executionId = await startFlow(handler, PARALLEL_FLOW_YAML);
		const s1 = fleet.sent.find(s => s.stepId === 's1');
		const s2 = fleet.sent.find(s => s.stepId === 's2');
		if (!s1 || !s2) throw new Error(`both steps should be assigned, got ${JSON.stringify(fleet.sent)}`);
		handler.onStepStarted(s1.ws as never, s1.assignmentId, executionId, 's1');
		handler.onStepFailed(executionId, 's1', 'boom');
		return { ...fleet, handler, executionId, workerA, workerB, s2 };
	}

	it('does not requeue or dispatch the sibling when its worker disconnects after the run was cleaned up', async () => {
		const { handler, sent, addWorker, s2, executionId } = await failWhileSiblingIsAssigned();
		const assignedBefore = sent.length;
		mockExecStore.markStepRunning.mockClear();
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		try {
			expect(() => handler.handleWorkerDisconnect(s2.ws as never)).not.toThrow();
			addWorker();
			expect(() => handler.tryDispatch()).not.toThrow();
			handler.tryDispatch();
		} finally {
			stderr.mockRestore();
		}

		// Nothing is handed out for the dead execution, nor marked running in its record.
		expect(sent).toHaveLength(assignedBefore);
		expect(mockExecStore.markStepRunning).not.toHaveBeenCalled();
		// The record stays failed.
		expect(mockExecStore.markExecutionFailed).toHaveBeenCalledWith(executionId);
		expect(mockExecStore.markExecutionCompleted).not.toHaveBeenCalled();
	});

	it('says in the execution log that the step was dropped rather than requeued', async () => {
		const { handler, s2, executionId } = await failWhileSiblingIsAssigned();
		mockLogWriter.writeExecution.mockClear();

		handler.handleWorkerDisconnect(s2.ws as never);

		const lines = mockLogWriter.writeExecution.mock.calls
			.filter(call => call[0] === executionId)
			.map(call => String(call[1]));
		expect(lines.some(line => /dropped/.test(line))).toBe(true);
		expect(lines.some(line => /re-queued/.test(line))).toBe(false);
	});
});

describe('CommandHandler -- a resumable execution and a late sibling result', () => {
	/** `approve` times out unanswered while `a` is still executing on another worker. */
	async function timeOutApprovalWhileSiblingRuns() {
		const fleet = createFakeFleet({ interactive: true });
		fleet.addWorker();
		fleet.addWorker();
		const handler = newHandler(fleet.pool);
		const executionId = await startFlow(handler, PARALLEL_INTERVENTION_FLOW_YAML);
		const approve = fleet.sent.find(s => s.stepId === 'approve');
		const a = fleet.sent.find(s => s.stepId === 'a');
		if (!approve || !a) throw new Error(`both steps should be assigned, got ${JSON.stringify(fleet.sent)}`);
		handler.onStepFailed(executionId, 'approve', TIMEOUT_ERROR);
		return { ...fleet, handler, executionId };
	}

	it('is still resumable, with its workspace held, after the sibling completes late', async () => {
		const { handler, executionId } = await timeOutApprovalWhileSiblingRuns();
		expect(handler.hasResumableInterventions()).toBe(true);
		mockRelease.mockClear();

		handler.onStepCompleted(executionId, 'a', { stdout: 'a' });

		expect(handler.hasResumableInterventions()).toBe(true);
		expect(mockRelease).not.toHaveBeenCalled();
		expect(handler.isExecutionActive(executionId)).toBe(true);
	});

	it('can still be resumed after the sibling completes late', async () => {
		const { handler, executionId } = await timeOutApprovalWhileSiblingRuns();
		handler.onStepCompleted(executionId, 'a', { stdout: 'a' });

		const response = handler.handleResume(executionId);

		expect(response).toEqual({ type: 'execution_resumed', executionId, stepId: 'approve' });
	});

	// Marking pending steps completed would turn the steps behind the unanswered approval into "done".
	it('does not mark the still-pending steps completed when the sibling completes late', async () => {
		const { handler, executionId } = await timeOutApprovalWhileSiblingRuns();
		mockExecStore.exists.mockReturnValue(true);
		mockExecStore.read.mockReturnValue({ steps: { a: { status: 'completed' }, approve: { status: 'pending' } } });

		handler.onStepCompleted(executionId, 'a', { stdout: 'a' });

		expect(mockExecStore.markStepCompleted).not.toHaveBeenCalled();
	});

	// Characterization: a second, real failure makes the execution unresumable
	// (FlowScheduler.resumeFailedStep is only valid when the intervention is the sole failure).
	it('is cleaned up when the sibling fails for real (current behaviour)', async () => {
		const { handler, executionId } = await timeOutApprovalWhileSiblingRuns();
		mockRelease.mockClear();

		handler.onStepFailed(executionId, 'a', 'boom');

		expect(handler.hasResumableInterventions()).toBe(false);
		expect(handler.isExecutionActive(executionId)).toBe(false);
	});
});

describe('CommandHandler -- order of the completed record and the cleanup on the success path (current behaviour)', () => {
	// A future run_end feature cannot assume the store says 'completed' before the cleanup ran.
	it('releases the workspace and forgets the execution BEFORE the store records it completed', async () => {
		const fleet = createFakeFleet();
		fleet.addWorker();
		const handler = newHandler(fleet.pool);
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		const s1 = fleet.sent[0]!;
		mockExecStore.read.mockReturnValue({ steps: { s1: { status: 'completed' } } });
		let activeWhenRecordedCompleted: boolean | undefined;
		mockExecStore.markExecutionCompleted.mockImplementation(() => {
			activeWhenRecordedCompleted = handler.isExecutionActive(executionId);
		});
		mockRelease.mockClear();
		const messages = new DaemonWorkerMessageHandler(
			path.join(tmpDir, 'logs'),
			() =>
				({
					commandHandler: handler,
					executionStore: mockExecStore,
					logWriter: mockLogWriter,
				}) as unknown as DaemonRuntime,
			() => {}
		);

		messages.handleMessage(
			s1.ws as never,
			{
				type: 'step_completed',
				assignmentId: s1.assignmentId,
				executionId,
				stepId: 's1',
				output: {},
			} as never
		);

		expect(mockExecStore.markExecutionCompleted).toHaveBeenCalledWith(executionId);
		expect(activeWhenRecordedCompleted).toBe(false);
		expect(mockRelease).toHaveBeenCalledTimes(1);
		expect(mockRelease.mock.invocationCallOrder[0]!).toBeLessThan(
			mockExecStore.markExecutionCompleted.mock.invocationCallOrder[0]!
		);
	});
});
