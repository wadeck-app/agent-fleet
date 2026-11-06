/**
 * A step whose `when` is false never runs: the scheduler settles it without dispatching it, so the store still holds
 * it `pending` when the run ends. The daemon then completes it; that completion must say WHY (skippedReason) and the
 * daemon log must carry a line for it, otherwise a skipped step looks like a step that ran.
 *
 * REAL FlowScheduler and ExecutionStore on a temp dir; only the log writer, workspaces and hooks are stubs.
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
const WHEN = "steps.a.outputs.go == 'dev'";

describe('StepOutcomes -- a step skipped by its when is recorded as skipped', () => {
	let tmpDir: string;
	let store: ExecutionStore;
	let queue: ReadyStepQueue;
	let registry: ExecutionRegistry;
	let outcomes: StepOutcomes;
	let scheduler: FlowScheduler;
	let logWriter: { writeExecution: ReturnType<typeof vi.fn> };

	function begin(steps: SchedulerStep[]): void {
		const depends = new Map(steps.map(s => [s.id, s.depends ?? []]));
		const context = { executionId: EXECUTION_ID, inputs: {}, stepOutputs: {}, stepMeta: {} };
		store.create({ executionId: EXECUTION_ID, flowFile: 'flow.yaml', flowId: 'f', stepIds: steps.map(s => s.id) });
		registry.start(EXECUTION_ID, scheduler, context as never, steps as never);
		queue.enqueueItems(scheduler.start(steps, depends), context as never);
		for (let item = queue.shift(); item; item = queue.shift()) {
			store.markStepRunning(EXECUTION_ID, item.stepId);
			scheduler.acknowledge(item.stepId);
		}
	}

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-outcomes-when-skip-'));
		store = new ExecutionStore(tmpDir);
		queue = new ReadyStepQueue();
		registry = new ExecutionRegistry();
		scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		logWriter = { writeExecution: vi.fn() };
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
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('records the false condition as the skip reason, without a start time or attempts, and logs it at info level', () => {
		begin([{ id: 'a' }, { id: 's', depends: ['a'], when: WHEN }]);
		store.markStepCompleted(EXECUTION_ID, 'a');
		outcomes.onStepCompleted(EXECUTION_ID, 'a', { go: 'prod' });

		const skipped = store.read(EXECUTION_ID).steps.s!;
		expect(skipped.status).toBe('completed');
		expect(skipped.skippedReason).toBe(`when "${WHEN}" was false`);
		expect(skipped.startedAt).toBeUndefined();
		expect(skipped.attempts).toBeUndefined();
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			EXECUTION_ID,
			`Step s skipped: when "${WHEN}" was false`,
			'info'
		);
	});

	it('says the scheduler skipped a step that has no condition of its own (a skipped parent or dependency)', () => {
		begin([{ id: 'a' }, { id: 's', depends: ['a'], when: WHEN }, { id: 'after', depends: ['s'], parent: 's' }]);
		store.markStepCompleted(EXECUTION_ID, 'a');
		outcomes.onStepCompleted(EXECUTION_ID, 'a', { go: 'prod' });

		const child = store.read(EXECUTION_ID).steps.after!;
		expect(child.status).toBe('completed');
		expect(child.skippedReason).toMatch(/^did not run: the scheduler skipped it/);
		expect(child.skippedReason).toContain("parent 's'");
	});

	it('does not touch a step that ran', () => {
		begin([{ id: 'a' }, { id: 's', depends: ['a'], when: WHEN }]);
		store.markStepCompleted(EXECUTION_ID, 'a');
		outcomes.onStepCompleted(EXECUTION_ID, 'a', { go: 'prod' });

		expect(store.read(EXECUTION_ID).steps.a!.skippedReason).toBeUndefined();
		expect(logWriter.writeExecution).not.toHaveBeenCalledWith(
			EXECUTION_ID,
			expect.stringContaining('Step a skipped'),
			expect.anything()
		);
	});
});
