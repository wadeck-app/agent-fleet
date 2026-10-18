import { describe, expect, it } from 'vitest';

import { type DaemonStatus, describeNoLiveWorkers } from './WorkerListing.js';

const entry = (sourceId: string, provider = 'built-in:command') => ({
	sourceId,
	provider,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'x',
	sourceTokenHash: 'y',
	createdAt: '2026-09-13T00:00:00.000Z',
});

const NOW = Date.parse('2026-10-18T10:00:00.000Z');
const stopped: DaemonStatus = { running: false, reason: 'Daemon is not running (no port file found in /cfg)' };
const running = (uptimeMs: number): DaemonStatus => ({
	running: true,
	pid: 4242,
	port: 51234,
	startedAt: new Date(NOW - uptimeMs).toISOString(),
});

describe('describeNoLiveWorkers', () => {
	// The message that prompted this: "No daemon running, so no workers are connected" told the
	// reader nothing about the source sitting in the registry, two commands away, which is exactly
	// what decides whether they have anything to fix.
	it('names the declared sources when the daemon is down', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], stopped, NOW);

		expect(message).toContain('factory-local');
		expect(message).toContain('flow start');
	});

	it('says the sources will be contacted, not that they are available', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], stopped, NOW);

		// Declared is not available (D#4): the wording must not imply capacity exists.
		expect(message).not.toMatch(/available|connected worker/i);
		expect(message).toMatch(/declared/i);
	});

	it('distinguishes nothing declared from declared but not live', () => {
		const nothing = describeNoLiveWorkers([], stopped, NOW);

		expect(nothing).toMatch(/no worker source is declared/i);
		expect(nothing).toContain('flow worker source add');
	});

	// A running daemon with no live worker is a different situation: the sources were already
	// contacted, so the reader needs to know that rather than being told to start a daemon.
	it('does not tell the user to start a daemon that is already running', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], running(60_000), NOW);

		expect(message).not.toContain('flow start');
		expect(message).toContain('factory-local');
	});

	it('lists every declared source, so a partly attached fleet is visible', () => {
		const message = describeNoLiveWorkers(
			[entry('laptop'), entry('builder', 'built-in:inbound')],
			running(60_000),
			NOW
		);

		expect(message).toContain('laptop');
		expect(message).toContain('builder');
		expect(message).toContain('built-in:inbound');
	});

	// The report that prompted this: the list was empty while three workers were alive. With no
	// daemon the old output claimed sources "were already asked for a worker", which is false.
	it('says no daemon is running, with the reason, instead of claiming sources were asked', () => {
		const message = describeNoLiveWorkers([entry('factory-local')], stopped, NOW);

		expect(message).toContain('no daemon is running');
		expect(message).toContain('no port file found in /cfg');
		expect(message).not.toContain('already asked');
	});

	it('tells the reader that external workers reconnect on their own and how to bring a daemon up', () => {
		const message = describeNoLiveWorkers([], stopped, NOW);

		expect(message).toMatch(/idle/i);
		expect(message).toMatch(/reconnect/);
		expect(message).toContain('flow start');
		expect(message).toContain('flow worker --help');
	});

	it('shows pid, port and uptime of a running daemon', () => {
		const message = describeNoLiveWorkers([], running(125_000), NOW);

		expect(message).toContain('pid=4242');
		expect(message).toContain('port=51234');
		expect(message).toContain('up 2m5s');
		expect(message).toContain('2026-10-18T09:57:55.000Z');
	});

	it('warns that workers may still be reconnecting when the daemon just started', () => {
		const message = describeNoLiveWorkers([], running(4_000), NOW);

		expect(message).toContain('up 4s');
		expect(message).toMatch(/still be reconnecting/);
		expect(message).toMatch(/retry/i);
	});

	it('does not claim a reconnect window for a long-running daemon, and still hints at flow worker', () => {
		const message = describeNoLiveWorkers([], running(10 * 60_000), NOW);

		expect(message).not.toMatch(/still be reconnecting/);
		expect(message).toContain('flow worker --help');
	});

	it('copes with a running daemon whose start time is unknown', () => {
		const message = describeNoLiveWorkers(
			[],
			{ running: true, pid: undefined, port: undefined, startedAt: undefined },
			NOW
		);

		expect(message).toContain('daemon is running');
		expect(message).toContain('details unavailable');
	});
});
