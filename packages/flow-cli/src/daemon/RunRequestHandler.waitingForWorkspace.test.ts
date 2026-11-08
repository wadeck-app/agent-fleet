/**
 * A run whose pool has no free slot is a WAITING EXECUTION: recorded (`queued`, with `workspaceWait`), inert (no scheduler,
 * worker or permit), counted as work in flight, started in arrival order when a slot is released, cancellable, and
 * started again after a daemon restart.
 *
 * REAL CommandHandler, execution store, validator and pool provider (temp folders); only the worker pool is a stub.
 */
import { DefinitionSnapshotStore, FlowDefinitionResolver, definitionsDirOf, executionsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ExecutionState } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import type { CommandHandler } from './CommandHandler';
import { TrackedCommandHandler, createMockWorkerPool, registerFolderAsProject } from './CommandHandlerTestHarness';

interface Assign {
	type: string;
	stepId: string;
	executionContext: { executionId: string; workspaceDir: string };
}

describe('RunRequestHandler -- a run waits for a workspace', () => {
	let tmpDir: string;
	let daemonDir: string;
	let poolDir: string;
	let flowFile: string;
	let disposeProject: () => void;
	let handlers: CommandHandler[];
	let pool: ReturnType<typeof createMockWorkerPool>;
	let store: ExecutionStore;

	function writeFlow(slots = 1): void {
		const poolPath = poolDir.replace(/\\/g, '/');
		fs.writeFileSync(
			flowFile,
			[
				'id: pool-flow',
				'version: "1.0.0"',
				'name: Pool Flow',
				'description: x',
				'inputs: {}',
				`workspace: { provider: pool, dir: "${poolPath}", prefix: ws-, count: ${String(slots)} }`,
				'steps:',
				'  - id: only',
				'    name: Only',
				'    type: script',
				'    script: echo hi',
				'',
			].join('\n')
		);
	}

	function makeSlots(count: number): void {
		for (let index = 1; index <= count; index++) {
			fs.mkdirSync(path.join(poolDir, `ws-${String(index)}`), { recursive: true });
		}
	}

	function newHandler(): CommandHandler {
		const handler = new TrackedCommandHandler(daemonDir, pool as never, pool as never, undefined, store);
		handlers.push(handler);
		return handler;
	}

	function record(executionId: string): ExecutionState {
		return JSON.parse(
			fs.readFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), 'utf8')
		) as ExecutionState;
	}

	function assigns(): Assign[] {
		return pool.send.mock.calls.map(call => call[1] as Assign).filter(message => message.type === 'assign');
	}

	async function run(handler: CommandHandler, requestId: string): Promise<string> {
		const response = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir, requestId } as never);
		if (response.type !== 'execution_started') {
			throw new Error(`expected execution_started, got ${JSON.stringify(response)}`);
		}
		return response.executionId;
	}

	/** Ends a run whose only step is dispatched: its workspace is released once the run end is settled. */
	async function finish(handler: CommandHandler, executionId: string): Promise<void> {
		handler.tryDispatch();
		handler.onStepCompleted(executionId, 'only', {});
		store.markExecutionCompleted(executionId);
		await vi.waitFor(() => expect(handler.isExecutionActive(executionId)).toBe(false));
	}

	beforeEach(async () => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'run-waiting-')));
		({ dispose: disposeProject } = await registerFolderAsProject(tmpDir));
		daemonDir = path.join(tmpDir, 'daemon');
		fs.mkdirSync(path.join(daemonDir, 'executions'), { recursive: true });
		fs.mkdirSync(path.join(daemonDir, 'logs'), { recursive: true });
		poolDir = path.join(tmpDir, 'pool');
		makeSlots(1);
		flowFile = path.join(tmpDir, 'pool-flow.yml');
		writeFlow();
		handlers = [];
		store = new ExecutionStore(executionsDirOf(daemonDir));
		pool = createMockWorkerPool();
		pool.send.mockReturnValue(true);
		pool.getIdle.mockReturnValue({});
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		for (const handler of handlers) {
			handler.stopBackgroundWork();
		}
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('starts a run at once when a slot is free, without any waiting trace', async () => {
		const handler = newHandler();

		const executionId = await run(handler, 'req-1');

		expect(handler.hasWaitingRuns()).toBe(false);
		expect(record(executionId).workspaceWait).toBeUndefined();
		handler.tryDispatch();
		expect(assigns().map(assign => assign.executionContext.workspaceDir)).toEqual([path.join(poolDir, 'ws-1')]);
	});

	it('answers a run that finds no free slot at once with execution_started, recorded as waiting and doing no work', async () => {
		const handler = newHandler();
		const first = await run(handler, 'req-1');

		const second = await run(handler, 'req-2');

		const waiting = record(second);
		expect(waiting.status).toBe('queued');
		expect(waiting.workspaceWait?.message).toContain('1/1');
		expect(waiting.workspaceWait?.message).toContain(first);
		expect(waiting.workspaceWait?.run).toMatchObject({ type: 'run', cwd: tmpDir });
		expect(waiting.workspaceWait?.run).not.toHaveProperty('requestId');
		expect(waiting.steps['only']!.status).toBe('pending');
		expect(handler.hasWaitingRuns()).toBe(true);
		// Only the run that has its slot counts as an active execution (no scheduler for the waiting one).
		handler.tryDispatch();
		expect(assigns().map(assign => assign.executionContext.executionId)).toEqual([first]);
		const log = fs
			.readdirSync(path.join(daemonDir, 'logs'))
			.flatMap(name => fs.readFileSync(path.join(daemonDir, 'logs', name), 'utf8').split('\n'));
		expect(log.some(line => line.includes(second) && line.includes('Waiting for a free workspace'))).toBe(true);
	});

	it('starts the waiting run on the slot the first run releases, and removes its waiting trace', async () => {
		const handler = newHandler();
		const first = await run(handler, 'req-1');
		const second = await run(handler, 'req-2');

		await finish(handler, first);
		await vi.waitFor(() => expect(handler.hasWaitingRuns()).toBe(false));
		handler.tryDispatch();

		await vi.waitFor(() =>
			expect(assigns().some(assign => assign.executionContext.executionId === second)).toBe(true)
		);
		expect(record(second).workspaceWait).toBeUndefined();
		expect(
			assigns().find(assign => assign.executionContext.executionId === second)!.executionContext.workspaceDir
		).toBe(path.join(poolDir, 'ws-1'));
		await finish(handler, second);
	});

	it('does not count the wait as run time: the run starts when it gets its workspace, and says how long it waited', async () => {
		const handler = newHandler();
		const first = await run(handler, 'req-1');
		const second = await run(handler, 'req-2');
		const arrival = record(second).startedAt;
		// Only the clock moves: the wait is 60 ms long without any real waiting.
		vi.useFakeTimers({ toFake: ['Date'], now: new Date(arrival).getTime() });
		vi.setSystemTime(new Date(arrival).getTime() + 60);

		await finish(handler, first);
		await vi.waitFor(() => expect(record(second).workspaceWait).toBeUndefined());
		vi.useRealTimers();

		const started = record(second);
		expect(new Date(started.startedAt).getTime()).toBeGreaterThan(new Date(arrival).getTime());
		expect(started.workspaceWaitedMs).toBeGreaterThanOrEqual(50);
		expect(new Date(started.startedAt).getTime() - new Date(arrival).getTime()).toBeGreaterThanOrEqual(
			started.workspaceWaitedMs! - 5
		);
		await finish(handler, second);
	});

	it('serves several waiting runs in the order they arrived', async () => {
		const handler = newHandler();
		const first = await run(handler, 'req-1');
		const second = await run(handler, 'req-2');
		const third = await run(handler, 'req-3');

		await finish(handler, first);
		await vi.waitFor(() => expect(record(second).workspaceWait).toBeUndefined());
		expect(record(third).workspaceWait).toBeDefined();
		await finish(handler, second);
		await vi.waitFor(() => expect(record(third).workspaceWait).toBeUndefined());
		await finish(handler, third);
	});

	it('cancels a waiting run: it ends cancelled, claims nothing, and the next run gets the slot', async () => {
		const handler = newHandler();
		const first = await run(handler, 'req-1');
		const second = await run(handler, 'req-2');
		const third = await run(handler, 'req-3');

		const response = handler.handleCancel({ type: 'cancel', executionId: second } as never);

		expect(response).toMatchObject({ type: 'execution_cancelled', executionId: second });
		await vi.waitFor(() => expect(handler.hasWaitingRuns()).toBe(true));
		const cancelled = record(second);
		expect(cancelled.status).toBe('failed');
		expect(cancelled.endReason).toBe('cancelled');
		expect(cancelled.workspaceWait).toBeUndefined();

		await finish(handler, first);
		await vi.waitFor(() => expect(record(third).workspaceWait).toBeUndefined());
		expect(record(second).status).toBe('failed');
		await finish(handler, third);
	});

	it('does not promote a waiting run while the daemon stops: it stays waiting, takes no slot, and starts after the restart', async () => {
		const handler = newHandler();
		const holder = await run(handler, 'req-1');
		const waiting = await run(handler, 'req-2');

		// The stop path: background work first, then the workers go away and the run that held the slot ends.
		handler.stopBackgroundWork();
		await finish(handler, holder);
		await vi.waitFor(() => expect(handler.hasWaitingRuns()).toBe(false));

		const kept = record(waiting);
		expect(kept.status).toBe('queued');
		expect(kept.workspaceWait).toBeDefined();
		expect(kept.lastError).toBeUndefined();
		expect(assigns().map(assign => assign.executionContext.executionId)).toEqual([holder]);
		expect(fs.existsSync(path.join(poolDir, '.flow-pool', 'ws-1.claim'))).toBe(false);

		// Next daemon: the waiting run is neither interrupted nor lost.
		const next = newHandler();
		expect(store.reconcileInterruptedExecutions()).toBe(0);
		await next.resumeWaitingExecutions(() => undefined);
		await vi.waitFor(() => expect(record(waiting).workspaceWait).toBeUndefined());
		expect(next.isExecutionActive(waiting)).toBe(true);
	});

	it('fails a waiting run loudly, with the cause, when the pool vanishes under it', async () => {
		const handler = newHandler();
		await run(handler, 'req-1');
		const second = await run(handler, 'req-2');

		fs.rmSync(path.join(poolDir, 'ws-1'), { recursive: true, force: true });
		fs.rmSync(path.join(poolDir, '.flow-pool'), { recursive: true, force: true });
		// The pool looks at its claims again every 5 s: it finds the slot folder gone.
		await vi.waitFor(() => expect(record(second).status).toBe('failed'), { timeout: 15_000 });

		expect(record(second).lastError).toContain('ws-1');
		expect(record(second).workspaceWait).toBeUndefined();
		expect(handler.hasWaitingRuns()).toBe(false);
	}, 30_000);

	describe('after a daemon restart', () => {
		/** Writes what a daemon that stopped while the run waited leaves behind: the record and the snapshot of its definition. */
		function leaveWaitingRecord(executionId: string, startedAt: string): void {
			const text = fs.readFileSync(flowFile, 'utf8');
			const resolver = new FlowDefinitionResolver(new DefinitionSnapshotStore(definitionsDirOf(daemonDir)));
			const flow = {
				id: 'pool-flow',
				version: '1.0.0',
				name: 'Pool Flow',
				description: 'x',
				inputs: {},
				workspace: { provider: 'pool', dir: poolDir.replace(/\\/g, '/'), prefix: 'ws-', count: 1 },
				steps: [{ id: 'only', name: 'Only', type: 'script', script: 'echo hi' }],
			};
			const resolved = resolver.forFile({ flowId: 'pool-flow', flow: flow as never, text, label: flowFile });
			resolved.commit();
			const state: ExecutionState = {
				executionId,
				flowFile,
				flowId: 'pool-flow',
				status: 'queued',
				currentSteps: [],
				startedAt,
				completedAt: null,
				steps: { only: { status: 'pending' } },
				flowVersion: resolved.version,
				definitionHash: resolved.hash,
				definitionSnapshot: resolved.definitionSnapshot,
				versionChoice: 'file',
				workspaceWait: {
					since: startedAt,
					message: 'was waiting',
					run: { type: 'run', flowFile, cwd: tmpDir },
				},
			};
			fs.writeFileSync(path.join(executionsDirOf(daemonDir), `${executionId}.json`), JSON.stringify(state));
		}

		it('starts the waiting runs again in their arrival order instead of failing them as interrupted', async () => {
			// Written out of order on purpose.
			leaveWaitingRecord('bbbb2222', '2026-01-01T00:00:02.000Z');
			leaveWaitingRecord('aaaa1111', '2026-01-01T00:00:01.000Z');
			const handler = newHandler();
			const reconciled = store.reconcileInterruptedExecutions();

			expect(reconciled).toBe(0);
			await handler.resumeWaitingExecutions(() => undefined);

			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());
			expect(handler.isExecutionActive('aaaa1111')).toBe(true);
			expect(record('bbbb2222').workspaceWait).toBeDefined();
			expect(handler.hasWaitingRuns()).toBe(true);
			handler.tryDispatch();
			expect(assigns().map(assign => assign.executionContext.executionId)).toEqual(['aaaa1111']);

			await finish(handler, 'aaaa1111');
			await vi.waitFor(() => expect(record('bbbb2222').workspaceWait).toBeUndefined());
			await finish(handler, 'bbbb2222');
		});

		it('runs the definition the run was accepted with, not the file as it is now', async () => {
			leaveWaitingRecord('aaaa1111', '2026-01-01T00:00:01.000Z');
			fs.writeFileSync(flowFile, 'this: [is not a flow anymore');
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);

			await vi.waitFor(() => expect(record('aaaa1111').workspaceWait).toBeUndefined());
			expect(handler.isExecutionActive('aaaa1111')).toBe(true);
			await finish(handler, 'aaaa1111');
		});

		it('fails a waiting run that cannot be started again, saying why and what to do', async () => {
			leaveWaitingRecord('aaaa1111', '2026-01-01T00:00:01.000Z');
			const state = record('aaaa1111');
			fs.writeFileSync(
				path.join(executionsDirOf(daemonDir), 'aaaa1111.json'),
				JSON.stringify({ ...state, definitionSnapshot: 'pool-flow/1.0.0-aaaaaaaaaaaa.yml' })
			);
			const handler = newHandler();
			store.reconcileInterruptedExecutions();

			await handler.resumeWaitingExecutions(() => undefined);

			const failed = record('aaaa1111');
			expect(failed.status).toBe('failed');
			expect(failed.workspaceWait).toBeUndefined();
			expect(failed.lastError).toContain('could not be started again');
			expect(failed.lastError).toContain('flow run');
			expect(handler.hasWaitingRuns()).toBe(false);
		});
	});
});
