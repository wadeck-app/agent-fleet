import { FlowScheduler } from 'flow-engine';

import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepInjection } from './StepInjection';

const EXECUTION_ID = 'exec-1';

/** An execution whose only step, `impl`, runs with subStepStrategy `strategy`. */
function setup(strategy: string): {
	injection: StepInjection;
	scheduler: FlowScheduler;
	setStepCount: ReturnType<typeof vi.fn>;
	enqueueItems: ReturnType<typeof vi.fn>;
} {
	const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
	scheduler.start([{ id: 'impl', subStepStrategy: strategy }], new Map([['impl', []]]));
	scheduler.acknowledge('impl');

	const setStepCount = vi.fn();
	const enqueueItems = vi.fn();
	const executions = {
		scheduler: () => scheduler,
		knownStepIds: () => new Set(scheduler.getStepIds()),
		stepCount: () => scheduler.getStepCount(),
		setStepCount,
		context: () => ({}),
	} as unknown as ExecutionRegistry;
	const secrets = { assertInjectable: vi.fn() } as unknown as DaemonSecrets;
	const queue = { enqueueItems } as unknown as ReadyStepQueue;
	return { injection: new StepInjection(executions, queue, secrets, 20, 50), scheduler, setStepCount, enqueueItems };
}

describe('StepInjection -- waves parent', () => {
	it('rejects an injected waves sub-step without wave, with the fix, and records nothing', () => {
		const { injection, scheduler, setStepCount, enqueueItems } = setup('waves');

		expect(() =>
			injection.injectSteps(EXECUTION_ID, [{ id: 'check', type: 'script', parent: 'impl', script: 'true' }])
		).toThrow(
			'sub-step "check" of "impl" (subStepStrategy: waves) needs a "wave" that is a non-negative integer, got undefined. Add e.g. "wave: 1" to "check".'
		);

		expect(scheduler.getStepIds().has('check')).toBe(false);
		expect(setStepCount).not.toHaveBeenCalled();
		expect(enqueueItems).not.toHaveBeenCalled();
	});

	it('injects a waves sub-step that declares a wave', () => {
		const { injection, scheduler, setStepCount } = setup('waves');

		injection.injectSteps(EXECUTION_ID, [{ id: 'check', type: 'script', parent: 'impl', wave: 1, script: 'true' }]);

		expect(scheduler.getStepIds().has('check')).toBe(true);
		expect(setStepCount).toHaveBeenCalledWith(EXECUTION_ID, 2);
	});

	it('does not require a wave under another strategy', () => {
		const { injection, scheduler } = setup('wait-all');

		injection.injectSteps(EXECUTION_ID, [{ id: 'check', type: 'script', parent: 'impl', script: 'true' }]);

		expect(scheduler.getStepIds().has('check')).toBe(true);
	});
});
