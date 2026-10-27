import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import type { WorkerProvisioner } from './WorkerProvisioner.js';

function build(plan: { fork: number } = { fork: 1 }) {
	const provisioner = {
		planProvisioning: vi.fn().mockReturnValue(plan),
		provision: vi.fn().mockResolvedValue(undefined),
	};
	const rerunDispatch = vi.fn();
	const requestFromDeclaredSources = vi.fn();
	const coverage = new UnmetDemandCoverage(
		provisioner as unknown as WorkerProvisioner,
		rerunDispatch,
		requestFromDeclaredSources
	);
	return { coverage, provisioner, rerunDispatch, requestFromDeclaredSources };
}

describe('UnmetDemandCoverage - steps nothing could take', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('plans and forks for the steps a host worker could run', () => {
		const { coverage, provisioner } = build({ fork: 2 });

		coverage.cover(2);

		expect(provisioner.planProvisioning).toHaveBeenCalledWith(2, 0);
		expect(provisioner.provision).toHaveBeenCalledTimes(2);
	});

	it('asks every declared source for a worker once per episode, as before', () => {
		const { coverage, requestFromDeclaredSources } = build({ fork: 0 });

		coverage.cover(1);
		coverage.cover(1);

		expect(requestFromDeclaredSources).toHaveBeenCalledTimes(1);
		expect(requestFromDeclaredSources).toHaveBeenCalledWith(undefined);
	});

	// A host worker can never run a step of a bound run, so forking one for it only spends a process.
	describe('steps of a run bound to a worker type', () => {
		it('never plans or forks a host worker for them', () => {
			const { coverage, provisioner } = build({ fork: 1 });

			coverage.cover(0, new Set(['sandbox']));

			expect(provisioner.planProvisioning).not.toHaveBeenCalled();
			expect(provisioner.provision).not.toHaveBeenCalled();
		});

		it('asks only the sources of that type for a worker, once while they wait', () => {
			const { coverage, requestFromDeclaredSources } = build();

			coverage.cover(0, new Set(['sandbox']));
			coverage.cover(0, new Set(['sandbox']));

			expect(requestFromDeclaredSources).toHaveBeenCalledTimes(1);
			expect(requestFromDeclaredSources).toHaveBeenCalledWith(new Set(['sandbox']));
		});

		it('asks again for a type that starts waiting later, and for the first one after nothing waited', () => {
			const { coverage, requestFromDeclaredSources } = build();

			coverage.cover(0, new Set(['sandbox']));
			coverage.cover(0, new Set(['sandbox', 'gpu']));
			coverage.cover(0);
			coverage.cover(0, new Set(['sandbox']));

			expect(requestFromDeclaredSources.mock.calls.map(call => [...(call[0] as Set<string>)].sort())).toEqual([
				['sandbox'],
				['gpu'],
				['sandbox'],
			]);
		});

		it('does not keep a demand re-check running for them: their own deadline timer covers the bound', () => {
			const { coverage, rerunDispatch } = build({ fork: 0 });

			coverage.cover(0, new Set(['sandbox']));
			vi.advanceTimersByTime(10_000);

			expect(rerunDispatch).not.toHaveBeenCalled();
		});

		it('plans only for the steps a host worker could run when both kinds wait', () => {
			const { coverage, provisioner, requestFromDeclaredSources } = build({ fork: 1 });

			coverage.cover(1, new Set(['sandbox']));

			expect(provisioner.planProvisioning).toHaveBeenCalledWith(1, 0);
			expect(provisioner.provision).toHaveBeenCalledTimes(1);
			expect(requestFromDeclaredSources).toHaveBeenCalledTimes(1);
			expect(requestFromDeclaredSources).toHaveBeenCalledWith(undefined);
		});
	});
});
