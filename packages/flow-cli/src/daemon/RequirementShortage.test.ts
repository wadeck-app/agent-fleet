import type { StepPlacement } from 'extension-points';
import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';
import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { RequirementShortage, type ShortageInputs } from './RequirementShortage.js';
import { StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

const source = (sourceId: string, plugin: string): WorkerSourceEntry =>
	({
		sourceId,
		provider: 'x',
		plugin,
		pluginsDir: '/p',
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: 'x',
	}) as WorkerSourceEntry;

const worker = (workerId: string, sourceId?: string): RegisteredWorker =>
	({
		state: 'idle',
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
	}) as RegisteredWorker;

async function build(declaration: Record<string, string[]>, options: { unreadable?: string[]; waitMs?: number } = {}) {
	const entries = Object.keys(declaration).map(id => source(id, `${id}.impl`));
	const declared = new DeclaredGuarantees(
		{ list: () => entries },
		{
			declaredGuarantees: async entry => {
				if (options.unreadable?.includes(entry.sourceId)) throw new Error('unreadable');
				return declaration[entry.sourceId] ?? [];
			},
		},
		() => {}
	);
	await declared.refresh();
	const clock = { now: 0 };
	const wait = new BoundStepWait(options.waitMs ?? 1_000, () => clock.now);
	const catalog = {
		typeLookup: () => (sourceId: string | undefined) => (sourceId === undefined ? undefined : `${sourceId}-type`),
		requirementOnlyLookup: () => () => false,
	};
	const shortage = new RequirementShortage(new StepRouter(undefined, undefined, catalog), declared, wait, {
		sinceFor: () => () => [],
	});
	return { shortage, wait, clock, declared };
}

function inputs(overrides: Partial<ShortageInputs> = {}, requires: string[] = ['fs=confined']): ShortageInputs {
	const placement: StepPlacement = { stepId: 's1', labels: [], requiresUserInterface: false, requires };
	return {
		executionId: 'e1',
		placement,
		connected: [],
		guaranteesOf: sourceId => (sourceId === 'sbx' ? ['fs=confined', 'net=filtered'] : []),
		...overrides,
	};
}

describe('RequirementShortage', () => {
	it('waits with no clock while a worker that meets the requirements is connected (it is busy)', async () => {
		const { shortage, wait } = await build({ sbx: ['fs=confined'] });

		expect(shortage.assess(inputs({ connected: [worker('w1', 'sbx')] }))).toEqual({
			action: 'wait',
			sources: new Set(),
		});
		expect(wait.size).toBe(0);
	});

	it('does not count a connected worker that meets them but refuses the step (the acceptance plugin said no)', async () => {
		const { shortage, wait } = await build({ sbx: ['fs=confined'] });
		const refusing = worker('w1', 'sbx');
		const notServedProject = { ...refusing, ephemeral: false, attachedProjectIds: [] } as RegisteredWorker;
		const placement = inputs().placement;

		const decision = shortage.assess(
			inputs({ connected: [notServedProject], placement: { ...placement, projectId: 'p1' } })
		);

		expect(decision.action).toBe('wait');
		expect(wait.size).toBe(1);
	});

	it('asks the declared sources that can provide the whole set, and waits up to the bound', async () => {
		const { shortage, clock } = await build(
			{ sbx: ['fs=confined', 'net=filtered'], other: ['fs=confined'] },
			{ waitMs: 1_000 }
		);
		const need = ['fs=confined', 'net=filtered'];

		expect(shortage.assess(inputs({}, need))).toEqual({ action: 'wait', sources: new Set(['sbx']) });
		clock.now += 1_001;
		const decision = shortage.assess(inputs({}, need));

		expect(decision.action).toBe('fail');
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('requires fs=confined, net=filtered');
		expect(reason).toContain('other lacks net=filtered');
	});

	it('fails at once, naming the entry and the near match, when no declared source declares it', async () => {
		const { shortage, wait } = await build({ sbx: ['fs=confined', 'env=clean'] });

		const decision = shortage.assess(inputs({}, ['fs=confind']));

		expect(decision.action).toBe('fail');
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('"fs=confind"');
		expect(reason).toContain('Did you mean "fs=confined"?');
		expect(reason).toContain('env=clean, fs=confined');
		expect(wait.size).toBe(0);
	});

	it('fails at once when every entry is declared by some source but no single source declares them all', async () => {
		const { shortage } = await build({ a: ['fs=confined'], b: ['net=filtered'] });

		const decision = shortage.assess(inputs({}, ['fs=confined', 'net=filtered']));

		expect(decision.action).toBe('fail');
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toMatch(/no single declared source/);
		expect(reason).toContain('a lacks net=filtered');
	});

	it('does not fail at once while the declaration of a source is unknown (unreadable): it waits for the bound', async () => {
		const { shortage } = await build({ sbx: ['fs=confined'], broken: [] }, { unreadable: ['broken'] });

		const decision = shortage.assess(inputs({}, ['gpu']));

		expect(decision).toEqual({ action: 'wait', sources: new Set() });
	});

	it('counts a connected worker that meets the set as able to provide it even when no declaration lists it', async () => {
		const { shortage } = await build({});

		const decision = shortage.assess(inputs({ connected: [worker('w1', 'sbx')] }, ['net=filtered']));

		expect(decision).toEqual({ action: 'wait', sources: new Set() });
	});

	// Asking for a guarantee is an explicit opt-in: an exclusive source is asked, and its workers serve the step.
	it('asks a source of an exclusive type for an unbound run, since the step asked for what it guarantees', async () => {
		const { shortage } = await build({ sbx: ['fs=confined'] });

		const decision = shortage.assess(inputs());

		expect(decision).toEqual({ action: 'wait', sources: new Set(['sbx']) });
	});

	it('counts a connected worker of an exclusive source that meets the set as serving', async () => {
		const { shortage, wait } = await build({ sbx: ['fs=confined'] });

		const decision = shortage.assess(inputs({ connected: [worker('w1', 'sbx')] }));

		expect(decision).toEqual({ action: 'wait', sources: new Set() });
		expect(wait.size).toBe(0);
	});
});
