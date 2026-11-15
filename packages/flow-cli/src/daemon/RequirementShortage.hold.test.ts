import type { StepPlacement } from 'extension-points';
import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';
import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { RequirementShortage, type ShortageInputs } from './RequirementShortage.js';
import { StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

const entry = {
	sourceId: 'sbx',
	provider: 'x',
	plugin: 'sbx.impl',
	pluginsDir: '/p',
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: 'x',
} as WorkerSourceEntry;

const heldWorker = (heldBy: string): RegisteredWorker =>
	({
		state: 'idle',
		workerId: 'w-held',
		pid: 1,
		labels: [],
		attachedProjects: [],
		attachedProjectIds: [],
		hasUserInterface: false,
		ephemeral: true,
		shellCapabilities: [],
		features: [],
		sourceId: 'sbx',
		heldBy,
	}) as RegisteredWorker;

async function build() {
	const declared = new DeclaredGuarantees(
		{ list: () => [entry] },
		{ declaredGuarantees: async () => ['fs=confined'] },
		() => {}
	);
	await declared.refresh();
	const clock = { now: 0 };
	const wait = new BoundStepWait(1_000, () => clock.now);
	const catalog = {
		typeLookup: () => () => 'sbx-type',
		requirementOnlyLookup: () => () => false,
	};
	const shortage = new RequirementShortage(new StepRouter(undefined, undefined, catalog), declared, wait, {
		sinceFor: () => () => [],
	});
	return { shortage, wait, clock };
}

function inputs(heldBy: string, staleRuns: string[]): ShortageInputs {
	const placement: StepPlacement = {
		stepId: 's1',
		labels: [],
		requiresUserInterface: false,
		requires: ['fs=confined'],
	};
	return {
		executionId: 'e2',
		placement,
		connected: [heldWorker(heldBy)],
		guaranteesOf: sourceId => (sourceId === 'sbx' ? ['fs=confined'] : []),
		isHoldStale: worker => worker.heldBy !== undefined && staleRuns.includes(worker.heldBy),
	};
}

describe('RequirementShortage - held workers', () => {
	it('keeps waiting, with no clock, for a worker held by a run that is still active', async () => {
		const { shortage, wait, clock } = await build();

		expect(shortage.assess(inputs('e1', [])).action).toBe('wait');
		clock.now += 10_000;
		expect(shortage.assess(inputs('e1', [])).action).toBe('wait');
		expect(wait.size).toBe(0);
	});

	// Decision D5: a busy or held worker is no reason to leave the source's maxWorkers unused.
	it('names the eligible sources while waiting for a serving worker, still with no clock', async () => {
		const { shortage, wait } = await build();

		const decision = shortage.assess(inputs('e1', []));

		expect(decision).toEqual({ action: 'wait', sources: new Set(['sbx']) });
		expect(wait.size).toBe(0);
	});

	it('names no source when none provides the requirements', async () => {
		const { shortage, wait } = await build();
		const unprovided = inputs('e1', []);
		unprovided.placement = { ...unprovided.placement, requires: ['fs=confined', 'net=none'] };
		unprovided.guaranteesOf = () => ['fs=confined', 'net=none'];

		const decision = shortage.assess(unprovided);

		expect(decision).toEqual({ action: 'wait', sources: new Set() });
		expect(wait.size).toBe(0);
	});

	it('does not wait forever for a worker held by a run that is over: fails after the bound naming the worker and run', async () => {
		const { shortage, wait, clock } = await build();

		expect(shortage.assess(inputs('e1', ['e1'])).action).toBe('wait');
		expect(wait.size).toBe(1);
		clock.now += 1_001;
		const decision = shortage.assess(inputs('e1', ['e1']));

		expect(decision.action).toBe('fail');
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('worker w-held is held by run e1, which is no longer active');
		expect(reason).toContain('restart that worker');
		expect(reason).toContain('flow worker list');
	});
});
