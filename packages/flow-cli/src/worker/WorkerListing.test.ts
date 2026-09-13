import { describe, expect, it } from 'vitest';

import { describeNoLiveWorkers } from './WorkerListing.js';

const entry = (sourceId: string, provider = 'built-in:command') => ({
	sourceId,
	provider,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'x',
	sourceTokenHash: 'y',
	createdAt: '2026-09-13T00:00:00.000Z',
});

describe('describeNoLiveWorkers', () => {
	// The message that prompted this: "No daemon running, so no workers are connected" told the
	// reader nothing about the source sitting in the registry, two commands away, which is exactly
	// what decides whether they have anything to fix.
	it('names the declared sources when the daemon is down', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], false);

		expect(message).toContain('factory-local');
		expect(message).toContain('flow start');
	});

	it('says the sources will be contacted, not that they are available', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], false);

		// Declared is not available (D#4): the wording must not imply capacity exists.
		expect(message).not.toMatch(/available|connected worker/i);
		expect(message).toMatch(/declared/i);
	});

	it('distinguishes nothing declared from declared but not live', () => {
		const nothing = describeNoLiveWorkers([], false);

		expect(nothing).toMatch(/no worker source is declared/i);
		expect(nothing).toContain('flow worker source add');
	});

	// A running daemon with no live worker is a different situation: the sources were already
	// contacted, so the reader needs to know that rather than being told to start a daemon.
	it('does not tell the user to start a daemon that is already running', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], true);

		expect(message).not.toContain('flow start');
		expect(message).toContain('factory-local');
	});

	it('lists every declared source, so a partly attached fleet is visible', () => {
		const message = describeNoLiveWorkers([entry('laptop'), entry('builder', 'built-in:inbound')], true);

		expect(message).toContain('laptop');
		expect(message).toContain('builder');
		expect(message).toContain('built-in:inbound');
	});
});
