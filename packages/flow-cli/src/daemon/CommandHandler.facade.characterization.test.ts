import * as fs from 'node:fs';
import * as path from 'node:path';

import {
	TrackedCommandHandler,
	createMockWorkerPool,
	daemonDir,
	forkedWorker,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';

const { mockAllocate, mockRelease, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' }),
	mockRelease: vi.fn().mockResolvedValue(undefined),
	hoistedState: { actualHomedir: '' as string },
}));

vi.mock('node:os', async importOriginal => {
	const actual = (await importOriginal()) as typeof import('node:os');
	hoistedState.actualHomedir = actual.homedir();
	return { ...actual, homedir: vi.fn().mockImplementation(() => actual.homedir()) };
});

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

/**
 * Pins what CommandHandler does as a facade over the collaborators it builds, ahead of moving that construction out of
 * it: how a lost step's failure is worded, the idle-state view, and the stop path. Behaviour only; no collaborator is named.
 */

const TWO_STEPS = `\
id: two-steps
version: "1.0.0"
name: Two Steps
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

function fleet() {
	const pool = createMockWorkerPool();
	const idle = new Set<object>();
	const sent: { ws: object; stepId: string; assignmentId: string }[] = [];
	const addWorker = (): object => {
		const ws = {};
		idle.add(ws);
		return ws;
	};
	pool.listIdle.mockImplementation(() => [...idle].map(ws => forkedWorker(ws)));
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

async function start(handler: TrackedCommandHandler): Promise<string> {
	const flowFile = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(flowFile, TWO_STEPS);
	const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	if (result.type !== 'execution_started') throw new Error(`refused: ${JSON.stringify(result)}`);
	return (result as { executionId: string }).executionId;
}

const failureReasonOf = (stepId: string): string | undefined =>
	mockExecStore.markStepFailed.mock.calls.find(call => call[1] === stepId)?.[2] as string | undefined;

describe('CommandHandler as a facade - characterization', () => {
	it('adds the details of the disconnect to the failure of a started step the worker held, and only for that call', async () => {
		const { pool, sent, addWorker } = fleet();
		addWorker();
		addWorker();
		const handler = newHandler(pool);
		const first = await start(handler);
		const firstS1 = sent.find(item => item.stepId === 's1')!;
		handler.onStepStarted(firstS1.ws as never, firstS1.assignmentId, first, 's1');

		handler.handleWorkerDisconnect(firstS1.ws as never, (_execution, stepId) =>
			stepId === 's1' ? 'details: the worker was killed' : undefined
		);
		const withDetails = failureReasonOf('s1');

		mockExecStore.markStepFailed.mockClear();
		addWorker();
		const second = await start(handler);
		const secondS1 = sent.filter(item => item.stepId === 's1').at(-1)!;
		handler.onStepStarted(secondS1.ws as never, secondS1.assignmentId, second, 's1');
		handler.handleWorkerDisconnect(secondS1.ws as never);

		expect(withDetails).toMatch(/ details: the worker was killed$/);
		expect(failureReasonOf('s1')).toMatch(/re-run the flow if it is safe to repeat\.$/);
	});

	it('words a lost started step the same way when no details are given', async () => {
		const { pool, sent, addWorker } = fleet();
		addWorker();
		const handler = newHandler(pool);
		const executionId = await start(handler);
		const s1 = sent.find(item => item.stepId === 's1')!;
		handler.onStepStarted(s1.ws as never, s1.assignmentId, executionId, 's1');

		handler.handleWorkerDisconnect(s1.ws as never);

		expect(failureReasonOf('s1')).toBeDefined();
		expect(failureReasonOf('s1')).not.toContain('details:');
	});

	it('reports an idle daemon, then an active execution, through the idle-state view', async () => {
		const { pool, addWorker } = fleet();
		addWorker();
		const handler = newHandler(pool);
		expect([handler.isQueueEmpty(), handler.hasActiveExecutions(), handler.hasPendingRunEnds()]).toEqual([
			true,
			false,
			false,
		]);
		const idleDescription = handler.describeIdleState();

		const executionId = await start(handler);

		expect(handler.isExecutionActive(executionId)).toBe(true);
		expect(handler.hasActiveExecutions()).toBe(true);
		expect(handler.isExecutionActive('unknown')).toBe(false);
		expect(handler.describeIdleState()).not.toBe(idleDescription);
		expect(idleDescription).toMatchInlineSnapshot(
			`"queue=0 activeExecutions=0 resumableInterventions=0 pendingRunEnds=0 waitingForWorkspace=0"`
		);
	});

	it('refuses a run while draining with the exact message, and accepts one again afterwards', async () => {
		const { pool, addWorker } = fleet();
		addWorker();
		const handler = newHandler(pool);
		handler.setDraining(true);
		const flowFile = path.join(tmpDir, 'flow.yml');
		fs.writeFileSync(flowFile, TWO_STEPS);

		const refused = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		expect(handler.isDraining()).toBe(true);
		handler.setDraining(false);
		const accepted = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(refused).toEqual({
			type: 'error',
			code: 'DAEMON_DRAINING',
			message:
				'The daemon is draining for a pending update and is not starting new flow runs. ' +
				'Retry once the update has been applied, or cancel the drain with: flow cli update --cancel-drain',
		});
		expect(accepted.type).toBe('execution_started');
	});

	it('announces a daemon stop and stops its background work without error when nothing is running', async () => {
		const { pool } = fleet();
		const handler = newHandler(pool);

		await expect(handler.announceDaemonStop()).resolves.toBeUndefined();
		expect(() => {
			handler.stopBackgroundWork();
		}).not.toThrow();
	});
});
