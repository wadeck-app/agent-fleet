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

// A throw out of a timer callback is an uncaught exception, and the daemon has no handler for it.
describe('UnmetDemandCoverage - the dispatch pass of the demand re-check throws', () => {
	let stderr: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		vi.useFakeTimers();
		stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});
	afterEach(() => {
		stderr.mockRestore();
		vi.useRealTimers();
	});

	const written = (): string[] => stderr.mock.calls.map((call: unknown[]) => String(call[0]));

	function failing() {
		const built = build({ fork: 0 });
		built.rerunDispatch.mockImplementation(() => {
			throw new Error('dispatch exploded');
		});
		built.coverage.cover(1);
		return built;
	}

	it('does not let the error escape the timer, and reports it', () => {
		const { coverage } = failing();

		expect(() => vi.advanceTimersByTime(250)).not.toThrow();

		expect(written()).toHaveLength(1);
		expect(written()[0]).toContain('[UnmetDemandCoverage]');
		expect(written()[0]).toContain('dispatch exploded');
		expect(written()[0]).toContain('asking again in');
		coverage.stop();
	});

	it('asks again after a longer delay each time, so a permanent error is not retried four times a second', () => {
		const { coverage, rerunDispatch } = failing();

		vi.advanceTimersByTime(250);
		expect(rerunDispatch).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(499);
		expect(rerunDispatch).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		expect(rerunDispatch).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(999);
		expect(rerunDispatch).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(1);
		expect(rerunDispatch).toHaveBeenCalledTimes(3);
		coverage.stop();
	});

	it('bounds the retries and the stderr lines of a permanent error to a few per minute', () => {
		const { coverage, rerunDispatch } = failing();

		vi.advanceTimersByTime(10 * 60_000);

		// 250ms, then 0.5s, 1s ... 30s, then every 30s: about 20 attempts in ten minutes, not 2400.
		expect(rerunDispatch.mock.calls.length).toBeLessThanOrEqual(30);
		expect(written().length).toBeLessThanOrEqual(25);
		// Reported, not swallowed: the first failure and the later ones that were left out are all accounted for.
		expect(written().join('')).toContain('similar failure');
		coverage.stop();
	});

	it('starts over at the short delay once a pass goes through', () => {
		const { coverage, rerunDispatch } = failing();
		vi.advanceTimersByTime(250 + 500);
		expect(rerunDispatch).toHaveBeenCalledTimes(2);

		rerunDispatch.mockImplementation(() => {
			throw new Error('still exploding');
		});
		rerunDispatch.mockImplementationOnce(() => undefined);
		vi.advanceTimersByTime(1_000);
		expect(rerunDispatch).toHaveBeenCalledTimes(3);
		coverage.cover(1);
		vi.advanceTimersByTime(250);
		expect(rerunDispatch).toHaveBeenCalledTimes(4);
		vi.advanceTimersByTime(499);
		expect(rerunDispatch).toHaveBeenCalledTimes(4);
		vi.advanceTimersByTime(1);
		expect(rerunDispatch).toHaveBeenCalledTimes(5);
		coverage.stop();
	});

	// What the real pass cannot do today (StepDispatcher.tryDispatch ends with demand.cover(), which arms the re-check
	// and returns), but nothing in this class may rely on: a pass that arms the 250ms re-check and then throws.
	it('bounds the retries of a pass that arms the re-check by itself and then throws', () => {
		const { coverage, rerunDispatch } = build({ fork: 0 });
		rerunDispatch.mockImplementation(() => {
			coverage.cover(1);
			throw new Error('dispatch exploded');
		});
		coverage.cover(1);

		vi.advanceTimersByTime(10 * 60_000);

		expect(rerunDispatch.mock.calls.length).toBeLessThanOrEqual(30);
		expect(written().length).toBeLessThanOrEqual(25);
		coverage.stop();
	});

	it('does not ask again once stopped', () => {
		const { coverage, rerunDispatch } = failing();
		vi.advanceTimersByTime(250);

		coverage.stop();
		vi.advanceTimersByTime(60_000);

		expect(rerunDispatch).toHaveBeenCalledTimes(1);
	});
});
