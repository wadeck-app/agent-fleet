import type { StepPlacement } from 'extension-points';
import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';
import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { RequirementShortage, type ShortageInputs } from './RequirementShortage.js';
import { StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';
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

const worker = (workerId: string, sourceId: string): RegisteredWorker =>
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
		sourceId,
	}) as RegisteredWorker;

/** Every source guarantees `sandbox`; `kinds` is what each accepts (undefined: no restriction), both statically and built. */
async function build(kinds: Record<string, string[] | undefined>) {
	const entries = Object.keys(kinds).map(source);
	const declared = new DeclaredGuarantees(
		{ list: () => entries },
		{ declaredGuarantees: async () => ['sandbox'], declaredWorkspaces: async entry => kinds[entry.sourceId] },
		() => {}
	);
	await declared.refresh();
	const catalog = {
		typeLookup: () => () => undefined,
		exclusiveLookup: () => () => false,
		workspaceLookup: () => (sourceId: string | undefined) => (sourceId === undefined ? undefined : kinds[sourceId]),
	};
	const wait = new BoundStepWait(1_000, () => 0);
	return new RequirementShortage(new StepRouter(undefined, undefined, catalog), declared, wait, {
		sinceFor: () => () => [],
	});
}

function inputs(workspaceKind: string | undefined, connected: RegisteredWorker[] = []): ShortageInputs {
	const placement: StepPlacement = {
		stepId: 's1',
		labels: [],
		requiresUserInterface: false,
		requires: ['sandbox'],
		...(workspaceKind === undefined ? {} : { workspaceKind }),
	};
	return {
		executionId: 'e1',
		placement,
		connected,
		guaranteesOf: () => ['sandbox'],
		typeOf: () => undefined,
	};
}

describe('RequirementShortage - workspace kinds', () => {
	it('asks only the sources that accept the kind of the run', async () => {
		const shortage = await build({ poolbox: ['pool'], openbox: undefined });

		expect(shortage.assess(inputs('in-place'))).toEqual({ action: 'wait', sources: new Set(['openbox']) });
	});

	it('does not count a connected worker whose source refuses the kind as one that serves (it would wait for nothing)', async () => {
		const shortage = await build({ poolbox: ['pool'] });

		const decision = shortage.assess(inputs('in-place', [worker('w1', 'poolbox')]));

		expect(decision.action).toBe('fail');
	});

	it('fails at once, naming the kind, the requirement, the sources and the fix, when no provider accepts the kind', async () => {
		const shortage = await build({ poolbox: ['pool'] });

		const decision = shortage.assess(inputs('in-place'));

		expect(decision).toMatchObject({ action: 'fail' });
		expect((decision as { reason: string }).reason).toMatch(
			/requires sandbox.*poolbox \(pool\).*workspace kind of this run is "in-place".*change "workspace:" in the flow to one of pool/s
		);
	});

	it('says the kind is unknown when the placement carries none', async () => {
		const shortage = await build({ poolbox: ['pool'] });

		expect((shortage.assess(inputs(undefined)) as { reason: string }).reason).toMatch(/unknown/);
	});

	it('keeps serving as before for a source that accepts the kind', async () => {
		const shortage = await build({ poolbox: ['pool'] });

		expect(shortage.assess(inputs('pool', [worker('w1', 'poolbox')]))).toEqual({
			action: 'wait',
			sources: new Set(),
		});
	});
});
