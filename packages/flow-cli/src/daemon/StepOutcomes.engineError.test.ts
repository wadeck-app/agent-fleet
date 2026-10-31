/**
 * When FlowScheduler throws while settling a step outcome (e.g. a `when` that cannot be evaluated), the
 * execution must END as failed with an engine-origin error naming the step, the cause and the fix. The
 * worker message handler only logs a throw, so before this a throw left the execution `running` with the
 * remaining steps `pending` forever.
 *
 * REAL FlowScheduler and ExecutionStore on a temp dir; only the log writer, workspaces and hooks are stubs.
 */
import { FlowScheduler } from 'flow-engine';
import type { SchedulerStep } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Mock } from 'vitest';

import { ExecutionStore } from '../storage/ExecutionStore';
import { DaemonSecrets } from './DaemonSecrets';
import { ExecutionRegistry } from './ExecutionRegistry';
import { ReadyStepQueue } from './ReadyStepQueue';
import { StepOutcomes } from './StepOutcomes';

const EXECUTION_ID = 'abcd1234';
const UNREACHABLE_WHEN = "steps.ghost.outputs.go == 'dev'";

describe('StepOutcomes -- a scheduler error ends the execution', () => {
	let tmpDir: string;
	let store: ExecutionStore;
	let queue: ReadyStepQueue;
	let registry: ExecutionRegistry;
	let outcomes: StepOutcomes;
	let scheduler: FlowScheduler;
	let logWriter: { writeExecution: ReturnType<typeof vi.fn> };
	let release: ReturnType<typeof vi.fn>;
	let onExecutionEnded: Mock<(executionId: string) => void>;
	let hooksDispatch: ReturnType<typeof vi.fn>;

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
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-outcomes-engine-error-'));
		store = new ExecutionStore(tmpDir);
		queue = new ReadyStepQueue();
		registry = new ExecutionRegistry();
		scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		logWriter = { writeExecution: vi.fn() };
		release = vi.fn();
		onExecutionEnded = vi.fn<(executionId: string) => void>();
		hooksDispatch = vi.fn();
		outcomes = new StepOutcomes(
			registry,
			queue,
			store,
			logWriter as never,
			new DaemonSecrets(),
			{ release } as never,
			{ dispatch: hooksDispatch } as never,
			vi.fn(),
			onExecutionEnded
		);
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function expectEnded(): void {
		expect(store.read(EXECUTION_ID).status).toBe('failed');
		expect(registry.scheduler(EXECUTION_ID)).toBeUndefined();
		expect(onExecutionEnded).toHaveBeenCalledWith(EXECUTION_ID);
		expect(release).toHaveBeenCalledTimes(1);
		expect(queue.shift()).toBeUndefined();
	}

	it('fails the step whose when cannot be evaluated, naming step, expression, cause and fix (completed path)', () => {
		begin([{ id: 'a' }, { id: 's', depends: ['a'], when: UNREACHABLE_WHEN }]);
		store.markStepCompleted(EXECUTION_ID, 'a');

		expect(() => outcomes.onStepCompleted(EXECUTION_ID, 'a', { go: 'x' })).not.toThrow();

		expectEnded();
		const failed = store.read(EXECUTION_ID).steps.s!;
		expect(failed.status).toBe('failed');
		expect(failed.error).toContain("step 's'");
		expect(failed.error).toContain(UNREACHABLE_WHEN);
		expect(failed.error).toContain("reading 'outputs'");
		expect(failed.error).toMatch(/depends/);
		expect(logWriter.writeExecution).toHaveBeenCalledWith(EXECUTION_ID, expect.stringContaining('s'), 'error');
		expect(hooksDispatch).toHaveBeenCalledWith(EXECUTION_ID, 'onStepFailed', expect.anything());
	});

	it('ends the execution when the scheduler throws on a failed outcome', () => {
		begin([{ id: 'a' }, { id: 'b', depends: ['a'] }]);
		vi.spyOn(scheduler, 'complete').mockImplementationOnce(() => {
			throw new Error('boom in scheduler');
		});
		store.markStepFailed(EXECUTION_ID, 'a', 'script failed');

		expect(() => outcomes.onStepFailed(EXECUTION_ID, 'a', 'script failed')).not.toThrow();

		expectEnded();
		expect(store.read(EXECUTION_ID).steps.a!.error).toContain('boom in scheduler');
	});

	it('ends the execution when recording the skipped steps throws', () => {
		begin([{ id: 'a' }, { id: 'b', depends: ['a'] }]);
		vi.spyOn(scheduler, 'takeSkippedSteps').mockImplementation(() => {
			throw new Error('cannot read skipped steps');
		});
		store.markStepCompleted(EXECUTION_ID, 'a');

		expect(() => outcomes.onStepCompleted(EXECUTION_ID, 'a', {})).not.toThrow();

		expectEnded();
		expect(logWriter.writeExecution).toHaveBeenCalledWith(
			EXECUTION_ID,
			expect.stringContaining('cannot read skipped steps'),
			'error'
		);
	});
});
