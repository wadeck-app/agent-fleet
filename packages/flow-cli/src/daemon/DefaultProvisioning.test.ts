import type { ProvisioningRequest } from 'extension-points';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SOURCE_WAIT_MS, DefaultProvisioning } from './DefaultProvisioning.js';

const request = (overrides: Partial<ProvisioningRequest> = {}): ProvisioningRequest => ({
	unmetDemand: 1,
	waitingMs: 0,
	declaredSources: [],
	allowance: 4,
	...overrides,
});

describe('DefaultProvisioning', () => {
	const provisioning = new DefaultProvisioning();

	// The zero-config path: no source is declared, so waiting could only add latency.
	it('forks immediately when nothing is declared', () => {
		const decision = provisioning.decide(request());

		expect(decision.fork).toBe(1);
		expect(decision.warning).toBeUndefined();
	});

	it('covers the whole demand, bounded by the allowance', () => {
		expect(provisioning.decide(request({ unmetDemand: 3, allowance: 4 })).fork).toBe(3);
		expect(provisioning.decide(request({ unmetDemand: 9, allowance: 2 })).fork).toBe(2);
	});

	it('asks for nothing when the daemon may have no more workers', () => {
		expect(provisioning.decide(request({ allowance: 0 })).fork).toBe(0);
	});

	it('asks for nothing when there is no demand', () => {
		expect(provisioning.decide(request({ unmetDemand: 0 })).fork).toBe(0);
	});

	// A declared source may still supply a worker, and using it is the preference (D#23).
	it('waits before forking while a declared source could still deliver', () => {
		const decision = provisioning.decide(request({ declaredSources: ['laptop'], waitingMs: 10 }));

		expect(decision.fork).toBe(0);
		expect(decision.warning).toBeUndefined();
	});

	// Bounded, because an unreachable or stale source would otherwise stall the flow
	// indefinitely -- which is also the DoS bound for a forged registry entry (T-10).
	it('forks once the wait is exhausted', () => {
		const decision = provisioning.decide(
			request({ declaredSources: ['laptop'], waitingMs: DEFAULT_SOURCE_WAIT_MS + 1 })
		);

		expect(decision.fork).toBe(1);
	});

	// A violated preference warrants a warning, not a failure -- but it has to name the
	// absentee, or the user sees a working flow and never learns their capacity is unused.
	it('names every source that produced nothing', () => {
		const decision = provisioning.decide(
			request({ declaredSources: ['laptop', 'build-box'], waitingMs: DEFAULT_SOURCE_WAIT_MS + 1 })
		);

		expect(decision.warning).toContain('laptop');
		expect(decision.warning).toContain('build-box');
	});

	it('says what it did about it, not just what went wrong', () => {
		const decision = provisioning.decide(
			request({ declaredSources: ['laptop'], waitingMs: DEFAULT_SOURCE_WAIT_MS + 1 })
		);

		expect(decision.warning).toMatch(/fork/i);
		expect(decision.warning).toMatch(/flow worker list/);
	});

	// The timeout belongs to this implementation, not to core config (D#26).
	it('takes the wait as its own option', () => {
		const impatient = new DefaultProvisioning({ waitForDeclaredSourcesMs: 100 });

		expect(impatient.decide(request({ declaredSources: ['laptop'], waitingMs: 50 })).fork).toBe(0);
		expect(impatient.decide(request({ declaredSources: ['laptop'], waitingMs: 150 })).fork).toBe(1);
	});

	// "Never wait" is a valid S8 configuration, not a competing design (D#25).
	it('supports a zero wait, forking on the first pass', () => {
		const eager = new DefaultProvisioning({ waitForDeclaredSourcesMs: 0 });

		expect(eager.decide(request({ declaredSources: ['laptop'], waitingMs: 0 })).fork).toBe(1);
	});

	it('rejects a negative wait rather than treating it as zero', () => {
		expect(() => new DefaultProvisioning({ waitForDeclaredSourcesMs: -1 })).toThrow(/waitForDeclaredSourcesMs/);
	});
});
