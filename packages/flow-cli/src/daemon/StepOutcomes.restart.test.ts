/**
 * A parent restarted because sub-steps failed resets every sub-step below it in the scheduler; the
 * execution store must follow (pending, nothing left over from the failed round), otherwise `flow show`
 * and `flow history` report stale "not run" reasons and `completed` steps that are about to run again.
 *
 * Driven through StepOutcomes (what CommandHandler delegates to) with a REAL FlowScheduler and a REAL
 * ExecutionStore on a temp dir; only the queue's consumers (log writer, workspaces, hooks) are stubs.
 *
 * Shape (wave 1 fails, wave 2 has a nested validator and a gate, wave 2 then fails, third round green):
 *   wave 1: w1_a, w1_b | wave 2: w2_rev (nested w2_val), w2_gate (after w2_val), w2_other | wave 3: w3
 */
import { FlowScheduler } from 'flow-engine';
import type { SchedulerStep } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from '../storage/ExecutionStore';
import { DaemonSecrets } from './DaemonSecrets';
import { ExecutionRegistry } from './ExecutionRegistry';
import { ReadyStepQueue } from './ReadyStepQueue';
import { StepOutcomes } from './StepOutcomes';

const EXECUTION_ID = 'abcd1234';
const SUB_STEPS = ['w1_a', 'w1_b', 'w2_rev', 'w2_val', 'w2_gate', 'w2_other', 'w3'];
const NOT_RUN_IN_ROUND_1 = ['w2_gate', 'w2_other', 'w2_rev', 'w2_val', 'w3'];

/** The same flow written for one strategy: `wait-all` + `depends` emulation, or `waves`. */
function flowFor(strategy: 'wait-all' | 'waves'): SchedulerStep[] {
	const sub = (id: string, wave: number, extra: Partial<SchedulerStep> = {}): SchedulerStep =>
		strategy === 'waves' ? { id, parent: 'impl', wave, ...extra } : { id, parent: 'impl', ...extra };
	const afterWave1 = strategy === 'waves' ? {} : { depends: ['w1_a', 'w1_b'] };
	return [
		{ id: 'impl', subStepStrategy: strategy },
		sub('w1_a', 1),
		sub('w1_b', 1),
		sub('w2_rev', 2, afterWave1),
		{ id: 'w2_val', parent: 'w2_rev' },
		sub('w2_gate', 2, strategy === 'waves' ? {} : { depends: ['w2_val'] }),
		sub('w2_other', 2, afterWave1),
		sub('w3', 3, strategy === 'waves' ? {} : { depends: ['w2_gate', 'w2_other'] }),
	];
}

describe.each(['wait-all', 'waves'] as const)('StepOutcomes -- store follows a parent restart (%s)', strategy => {
	let tmpDir: string;
	let store: ExecutionStore;
	let queue: ReadyStepQueue;
	let registry: ExecutionRegistry;
	let outcomes: StepOutcomes;
	let scheduler: FlowScheduler;
	let logWriter: { writeExecution: ReturnType<typeof vi.fn> };
	/** Step ids in the order they were handed out to run. */
	let dispatched: string[];

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-outcomes-restart-'));
		store = new ExecutionStore(tmpDir);
		queue = new ReadyStepQueue();
		registry = new ExecutionRegistry();
		logWriter = { writeExecution: vi.fn() };
		dispatched = [];

		const steps = flowFor(strategy);
		const depends = new Map(
			steps.map(s => {
				const explicit = s.depends ?? [];
				return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
			})
		);
		scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		const context = { executionId: EXECUTION_ID, inputs: {}, stepOutputs: {}, stepMeta: {} };
		store.create({
			executionId: EXECUTION_ID,
			flowFile: 'flow.yaml',
			flowId: 'restart-flow',
			stepIds: steps.map(s => s.id),
		});
		registry.start(EXECUTION_ID, scheduler, context as never, steps as never);
		outcomes = new StepOutcomes(
			registry,
			queue,
			store,
			logWriter as never,
			new DaemonSecrets(),
			{ release: vi.fn() } as never,
			{ dispatch: vi.fn() } as never,
			vi.fn(),
			vi.fn()
		);
		queue.enqueueItems(scheduler.start(steps, depends), context as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	/** What the daemon does when it hands the queued steps to workers. */
	const dispatchQueued = (): string[] => {
		const ids: string[] = [];
		for (let item = queue.shift(); item; item = queue.shift()) {
			store.markStepRunning(EXECUTION_ID, item.stepId);
			scheduler.acknowledge(item.stepId);
			ids.push(item.stepId);
		}
		dispatched.push(...ids);
		return ids.sort();
	};
	// Like DaemonWorkerMessageHandler, the store learns the step ended before StepOutcomes is told
	const succeed = (id: string): void => {
		store.markStepCompleted(EXECUTION_ID, id);
		outcomes.onStepCompleted(EXECUTION_ID, id, {});
	};
	const fail = (id: string, error: string): void => {
		store.markStepFailed(EXECUTION_ID, id, error);
		outcomes.onStepFailed(EXECUTION_ID, id, error, { stderr: error });
	};
	const stepStates = () => store.read(EXECUTION_ID).steps;
	const expectSubStepsClean = (): void => {
		for (const id of SUB_STEPS) {
			expect(stepStates()[id]!.status, `${id} status`).toBe('pending');
			expect(stepStates()[id]!.skippedReason, `${id} skippedReason`).toBeUndefined();
		}
	};

	it('resets every sub-step to pending without any leftover reason, then runs the next rounds correctly', () => {
		expect(dispatchQueued()).toEqual(['impl']);
		succeed('impl');

		// Round 1: wave 1 fails entirely; the rest is settled as not run and the parent is relaunched
		expect(dispatchQueued()).toEqual(['w1_a', 'w1_b']);
		fail('w1_a', 'W1A failed');
		fail('w1_b', 'W1B failed');

		expectSubStepsClean();
		// The not-run steps were recorded (and logged) first, then reset with the restart
		const logged = logWriter.writeExecution.mock.calls.map(c => String(c[1]));
		for (const id of NOT_RUN_IN_ROUND_1) {
			expect(
				logged.some(line => line.startsWith(`Step ${id} `)),
				`a log line for ${id}`
			).toBe(true);
		}
		expect(logged.some(line => line.startsWith('Sub-steps reset for the next round: '))).toBe(true);

		// Round 2: wave 1 passes, wave 2 starts (the reviewer, its sibling, and with waves also the gate)
		expect(dispatchQueued()).toEqual(['impl']);
		succeed('impl');
		expect(dispatchQueued()).toEqual(['w1_a', 'w1_b']);
		succeed('w1_a');
		succeed('w1_b');
		expect(dispatchQueued()).toEqual(['w2_other', 'w2_rev'].concat(strategy === 'waves' ? ['w2_gate'] : []).sort());
		expect(stepStates()['w2_rev']!.skippedReason).toBeUndefined();
		succeed('w2_rev');
		expect(dispatchQueued()).toEqual(['w2_val']);
		fail('w2_other', 'W2 OTHER failed');
		succeed('w2_val');
		if (strategy === 'wait-all') {
			expect(dispatchQueued()).toEqual(['w2_gate']);
		}
		// The gate fails too: the parent is relaunched on the failures of THIS wave, not terminally failed
		fail('w2_gate', 'W2 GATE blocking finding');
		expect(scheduler.hasFailed()).toBe(false);
		expect(registry.isActive(EXECUTION_ID)).toBe(true);
		expectSubStepsClean();
		expect(dispatched).not.toContain('w3');

		// Round 3: green all the way; wave 3 only after a fully green wave 2
		expect(dispatchQueued()).toEqual(['impl']);
		succeed('impl');
		expect(dispatchQueued()).toEqual(['w1_a', 'w1_b']);
		succeed('w1_a');
		succeed('w1_b');
		dispatchQueued();
		succeed('w2_rev');
		dispatchQueued();
		succeed('w2_val');
		dispatchQueued();
		succeed('w2_gate');
		expect(dispatched).not.toContain('w3');
		succeed('w2_other');
		expect(dispatchQueued()).toEqual(['w3']);
		succeed('w3');

		expect(registry.isActive(EXECUTION_ID)).toBe(false);
		for (const [id, step] of Object.entries(stepStates())) {
			expect(step.skippedReason, `${id} skippedReason at the end`).toBeUndefined();
			expect(step.status, `${id} final status`).toBe('completed');
		}
	});
});

describe('StepOutcomes -- production code fails loudly on a scheduler without takeRequeuedSteps', () => {
	it('does not tolerate a scheduler that cannot report requeued steps', () => {
		const registry = new ExecutionRegistry();
		const scheduler = {
			complete: vi.fn().mockReturnValue([]),
			takeSkippedSteps: vi.fn().mockReturnValue([]),
			isTerminal: vi.fn().mockReturnValue(false),
		};
		registry.start(
			EXECUTION_ID,
			scheduler as never,
			{ executionId: EXECUTION_ID, inputs: {}, stepOutputs: {}, stepMeta: {} } as never,
			[]
		);
		const outcomes = new StepOutcomes(
			registry,
			new ReadyStepQueue(),
			{} as never,
			{ writeExecution: vi.fn() } as never,
			new DaemonSecrets(),
			{} as never,
			{} as never,
			vi.fn(),
			vi.fn()
		);

		expect(() => outcomes.onStepCompleted(EXECUTION_ID, 's', {})).toThrow(/takeRequeuedSteps/);
	});
});
