import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

const source = (sourceId: string): WorkerSourceEntry =>
	({
		sourceId,
		provider: 'x',
		plugin: `${sourceId}.impl`,
		pluginsDir: '/p',
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: 'x',
	}) as WorkerSourceEntry;

const workerOf = (workerId: string, sourceId?: string) => ({
	ws: { workerId } as unknown as WebSocket,
	worker: {
		state: 'idle' as const,
		workerId,
		pid: 1,
		labels: [],
		attachedProjects: [],
		attachedProjectIds: [],
		hasUserInterface: false,
		ephemeral: true,
		shellCapabilities: [],
		features: [],
		...(sourceId === undefined ? {} : { sourceId }),
	},
});

/** Sources: `sbx` guarantees fs=confined and env=clean (declared the same), `plain` guarantees nothing. */
const GUARANTEES: Record<string, string[]> = { sbx: ['fs=confined', 'env=clean'], plain: [] };

async function build(
	options: {
		declared?: Record<string, string[]>;
		boundStepWaitMs?: number;
		withShortage?: boolean;
		exclusive?: string[];
	} = {}
) {
	const declaration = options.declared ?? { sbx: ['fs=confined', 'env=clean'], plain: [] };
	const declared = new DeclaredGuarantees(
		{ list: () => Object.keys(declaration).map(source) },
		{ declaredGuarantees: async entry => declaration[entry.sourceId] ?? [] },
		() => {}
	);
	await declared.refresh();

	const clock = { now: 0 };
	const wait = new BoundStepWait(options.boundStepWaitMs ?? 1_000, () => clock.now);
	const idle: ReturnType<typeof workerOf>[] = [];
	const connected: ReturnType<typeof workerOf>[] = [];
	const sent: { workerId: string; stepId: string; message: Record<string, unknown> }[] = [];
	const registry = {
		listIdle: () => idle,
		listConnected: () => connected.map(entry => entry.worker),
		summarize: () => [],
		describe: (ws: WebSocket) => ({
			workerId: (ws as unknown as { workerId: string }).workerId,
			features: [] as string[],
		}),
		markBusy: vi.fn(),
		send: vi.fn((ws: WebSocket, message: Record<string, unknown>) => {
			sent.push({
				workerId: (ws as unknown as { workerId: string }).workerId,
				stepId: String(message['stepId']),
				message,
			});
			return true;
		}),
	};
	const queue = new ReadyStepQueue();
	const executions = new ExecutionRegistry();
	const scheduler = {
		getSubStepErrors: () => [],
		getSubSteps: () => undefined,
		getSubStepRelaunchFeedback: () => undefined,
		acknowledge: vi.fn(),
		getRetryCount: () => 0,
	};
	const context = { executionId: 'e1' } as ExecutionContext;
	executions.start('e1', scheduler as unknown as FlowScheduler, context, []);
	const failed: { stepId: string; reason: string }[] = [];
	const cover = vi.fn();
	const dispatcher = new StepDispatcher(
		registry as never,
		queue,
		executions,
		{ issue: () => 'a1', watchHandedOver: vi.fn() } as never,
		{ cover } as never,
		{ valuesForStep: () => undefined } as never,
		{ markStepRunning: vi.fn() } as never,
		{ dispatch: vi.fn() } as never,
		{ writeExecution: vi.fn() } as never,
		{ decide: () => ({ action: 'wait' }) },
		(_executionId, stepId, reason) => failed.push({ stepId, reason }),
		{
			workerTypes: {
				typeLookup: () => sourceId => (sourceId === undefined ? undefined : `${sourceId}-type`),
				exclusiveLookup: () => sourceId =>
					sourceId !== undefined && (options.exclusive ?? []).includes(sourceId),
				knownTypes: () => ['sbx-type', 'plain-type'],
				guaranteeLookup: () => sourceId => (sourceId === undefined ? [] : (GUARANTEES[sourceId] ?? [])),
			},
			wait,
			contactErrors: { sinceFor: () => () => [] },
			...(options.withShortage === false ? {} : { declaredGuarantees: declared }),
		}
	);
	const enqueue = (stepId: string, stepConfig: Record<string, unknown> = {}) =>
		queue.unshift({
			stepId,
			stepConfig: { id: stepId, type: 'script', ...stepConfig } as unknown as AssignableStep,
			executionContext: context,
		});
	const addWorker = (entry: ReturnType<typeof workerOf>, isIdle = true) => {
		connected.push(entry);
		if (isIdle) idle.push(entry);
	};
	return { dispatcher, executions, enqueue, addWorker, sent, failed, cover, wait, clock, queue };
}

describe('StepDispatcher - requirements', () => {
	it('hands a step that requires something only to a worker whose source guarantees it', async () => {
		const { dispatcher, executions, enqueue, addWorker, sent } = await build();
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		addWorker(workerOf('w-host'));
		addWorker(workerOf('w-plain', 'plain'));
		addWorker(workerOf('w-sbx', 'sbx'));
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.workerId)).toEqual(['w-sbx']);
	});

	it('reads the requirements per placement from the execution: a step injected later inherits the run requirements', async () => {
		const { dispatcher, executions, enqueue, addWorker, sent } = await build();
		addWorker(workerOf('w-host'));
		addWorker(workerOf('w-sbx', 'sbx'));
		enqueue('injected');
		executions.bindRequirements('e1', { run: ['env=clean'], steps: {} });

		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.workerId)).toEqual(['w-sbx']);
	});

	it('adds the own requires of an injected step to the run requirements', async () => {
		const { dispatcher, executions, enqueue, addWorker, sent, failed } = await build();
		executions.bindRequirements('e1', { run: ['env=clean'], steps: {} });
		addWorker(workerOf('w-sbx', 'sbx'));
		enqueue('injected', { requires: ['net=filtered'] });

		dispatcher.tryDispatch();

		expect(sent).toHaveLength(0);
		expect(failed).toHaveLength(1);
		expect(failed[0]?.reason).toContain('net=filtered');
	});

	it('uses the recorded set of a declared step and ignores what its config says (a resume never resolves again)', async () => {
		const { dispatcher, executions, enqueue, addWorker, sent } = await build();
		executions.bindRequirements('e1', { run: [], steps: { s1: ['fs=confined'] } });
		addWorker(workerOf('w-host'));
		addWorker(workerOf('w-sbx', 'sbx'));
		enqueue('s1', { requires: ['something-else'] });

		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.workerId)).toEqual(['w-sbx']);
	});

	it('leaves a step of a run that requires nothing to every worker, as before', async () => {
		const { dispatcher, enqueue, addWorker, sent } = await build();
		addWorker(workerOf('w-host'));
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.workerId)).toEqual(['w-host']);
	});

	it('fails a step whose own requires is malformed, naming it, instead of leaving it queued', async () => {
		const { dispatcher, enqueue, addWorker, failed, queue } = await build();
		addWorker(workerOf('w-sbx', 'sbx'));
		enqueue('injected', { requires: 'fs=confined' });

		dispatcher.tryDispatch();

		expect(failed[0]?.stepId).toBe('injected');
		expect(failed[0]?.reason).toMatch(/Step "injected".*must be a list/);
		expect(queue.length).toBe(0);
	});

	it('keeps the step queued, asks the sources that can provide it, and does not count it as demand for a host worker', async () => {
		const { dispatcher, executions, enqueue, addWorker, cover, queue, failed } = await build();
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		addWorker(workerOf('w-host'));
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(queue.length).toBe(1);
		expect(failed).toEqual([]);
		expect(cover).toHaveBeenCalledWith(0, new Set(), new Set(['sbx']));
	});

	it('waits for a busy worker that meets the requirements without a clock, and never fails the step', async () => {
		const { dispatcher, executions, enqueue, addWorker, clock, failed, wait } = await build({
			boundStepWaitMs: 1_000,
		});
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		addWorker(workerOf('w-sbx', 'sbx'), false);
		enqueue('s1');

		dispatcher.tryDispatch();
		clock.now += 10_000;
		dispatcher.tryDispatch();

		expect(failed).toEqual([]);
		expect(wait.size).toBe(0);
	});

	it('fails the step after the bound when no worker came, with the requirements in the message', async () => {
		const { dispatcher, executions, enqueue, clock, failed, wait } = await build({ boundStepWaitMs: 1_000 });
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		enqueue('s1');

		dispatcher.tryDispatch();
		expect(wait.size).toBe(1);
		clock.now = 1_000;
		dispatcher.tryDispatch();

		expect(failed).toHaveLength(1);
		expect(failed[0]?.reason).toContain('requires fs=confined');
		expect(wait.size).toBe(0);
	});

	it('fails the step at once when no declared source can ever provide a requirement', async () => {
		const { dispatcher, executions, enqueue, failed, wait } = await build();
		executions.bindRequirements('e1', { run: ['fs=confind'], steps: { s1: ['fs=confind'] } });
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(failed).toHaveLength(1);
		expect(failed[0]?.reason).toContain('Did you mean "fs=confined"?');
		expect(wait.size).toBe(0);
	});

	it('forgets the wait of a step once it is handed to a worker', async () => {
		const { dispatcher, executions, enqueue, addWorker, wait } = await build();
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		enqueue('s1');
		dispatcher.tryDispatch();
		expect(wait.size).toBe(1);

		addWorker(workerOf('w-sbx', 'sbx'));
		dispatcher.tryDispatch();

		expect(wait.size).toBe(0);
	});

	it('requires the worker type too when the run is bound (both must hold)', async () => {
		const { dispatcher, executions, enqueue, addWorker, sent } = await build();
		executions.bindWorkerType('e1', 'plain-type');
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		addWorker(workerOf('w-sbx', 'sbx'));
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(sent).toHaveLength(0);
	});

	it('fails the step loudly when the dispatcher was built without the declared guarantees (a wiring mistake)', async () => {
		const { dispatcher, executions, enqueue, failed } = await build({ withShortage: false });
		executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(failed[0]?.reason).toMatch(/wiring mistake/);
	});

	// Contract for a wrapper that wants to refuse (defence in depth): the daemon routes by the guarantees of the source, and
	// also tells the worker what it was routed for.
	describe('the assign message', () => {
		it('carries the resolved requirements of the step, sorted, in `requires`', async () => {
			const { dispatcher, executions, enqueue, addWorker, sent } = await build();
			executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['env=clean', 'fs=confined'] } });
			addWorker(workerOf('w-sbx', 'sbx'));
			enqueue('s1');

			dispatcher.tryDispatch();

			expect(sent[0]?.message).toMatchObject({
				type: 'assign',
				stepId: 's1',
				requires: ['env=clean', 'fs=confined'],
			});
		});

		it('carries the inherited requirements of an injected step', async () => {
			const { dispatcher, executions, enqueue, addWorker, sent } = await build();
			executions.bindRequirements('e1', { run: ['fs=confined'], steps: {} });
			addWorker(workerOf('w-sbx', 'sbx'));
			enqueue('injected');

			dispatcher.tryDispatch();

			expect(sent[0]?.message['requires']).toEqual(['fs=confined']);
		});

		it('has no `requires` field for a step that requires nothing (a message as older daemons sent it)', async () => {
			const { dispatcher, enqueue, addWorker, sent } = await build();
			addWorker(workerOf('w-host'));
			enqueue('s1');

			dispatcher.tryDispatch();

			expect(sent[0]?.message).not.toHaveProperty('requires');
		});

		// Additive: `host: true` is repeated at the top level so a wrapper does not parse stepConfig; the whole step
		// definition (stepConfig) carries it as well.
		it('carries `host: true` at the top level for a script step marked host, next to the full stepConfig', async () => {
			const { dispatcher, enqueue, addWorker, sent } = await build();
			addWorker(workerOf('w-sbx', 'sbx'));
			enqueue('s1', { host: true });

			dispatcher.tryDispatch();

			expect(sent[0]?.message).toMatchObject({ type: 'assign', stepId: 's1', host: true });
			expect((sent[0]?.message['stepConfig'] as { host?: unknown }).host).toBe(true);
		});

		it.each([
			['host: false', { host: false }],
			['no host', {}],
			['a string "true" (only the literal boolean counts)', { host: 'true' }],
			['a template', { host: '${{ inputs.x }}' }],
			['host on a model step', { type: 'model', host: true }],
		])('has no `host` field for %s', async (_label, config) => {
			const { dispatcher, enqueue, addWorker, sent } = await build();
			addWorker(workerOf('w-host'));
			enqueue('s1', config);

			dispatcher.tryDispatch();

			expect(sent[0]?.message).not.toHaveProperty('host');
		});
	});

	// Asking for a guarantee is an explicit opt-in: an exclusive source serves it, and still nothing that asks for nothing.
	describe('an exclusive source', () => {
		it('serves a step whose requirements it guarantees, and an injected step that inherits them', async () => {
			const { dispatcher, executions, enqueue, addWorker, sent } = await build({ exclusive: ['sbx'] });
			executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
			addWorker(workerOf('w-sbx', 'sbx'));
			enqueue('s1');
			enqueue('injected');

			dispatcher.tryDispatch();

			expect(sent.map(entry => entry.stepId).sort()).toEqual(['injected', 's1']);
		});

		it('does not serve a step of a run that requires nothing', async () => {
			const { dispatcher, enqueue, addWorker, sent } = await build({ exclusive: ['sbx'] });
			addWorker(workerOf('w-sbx', 'sbx'));
			enqueue('s1');

			dispatcher.tryDispatch();

			expect(sent).toEqual([]);
		});

		it('does not serve a step requiring something it does not guarantee', async () => {
			const { dispatcher, executions, enqueue, addWorker, sent } = await build({ exclusive: ['sbx'] });
			executions.bindRequirements('e1', { run: [], steps: { s1: ['fs=confined', 'net=filtered'] } });
			addWorker(workerOf('w-sbx', 'sbx'));
			enqueue('s1');

			dispatcher.tryDispatch();

			expect(sent).toEqual([]);
		});

		it('is asked by id when a step waits for what only it declares, and no host worker is forked for the step', async () => {
			const { dispatcher, executions, enqueue, cover, failed } = await build({ exclusive: ['sbx'] });
			executions.bindRequirements('e1', { run: ['fs=confined'], steps: { s1: ['fs=confined'] } });
			enqueue('s1');

			dispatcher.tryDispatch();

			expect(failed).toEqual([]);
			expect(cover).toHaveBeenCalledWith(0, new Set(), new Set(['sbx']));
		});
	});
});
