import { describe, expect, it, vi } from 'vitest';

import { PluginLoader } from '../config/PluginLoader.js';
import { DaemonSourceContact } from './DaemonSourceContact.js';
import { LaunchTokenIssuer } from './LaunchTokenIssuer.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

const entry = (sourceId: string, provider: string, options?: Record<string, unknown>) => ({
	sourceId,
	provider,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-06T00:00:00.000Z',
	...(options === undefined ? {} : { options }),
});

describe('contactDeclaredSources - the outcome of each ask', () => {
	it('tells the outcome sink that a source failed, and nothing about why', async () => {
		const outcome = { failed: vi.fn(), succeeded: vi.fn() };

		await contactDeclaredSources([entry('broken', 'built-in:command', {})], 'ws://x', () => {}, {
			contactOutcome: outcome,
		});

		expect(outcome.failed).toHaveBeenCalledExactlyOnceWith('broken');
		expect(outcome.succeeded).not.toHaveBeenCalled();
	});

	it('tells it when an ask succeeded', async () => {
		const outcome = { failed: vi.fn(), succeeded: vi.fn() };

		await contactDeclaredSources([entry('fine', 'built-in:inbound')], 'ws://x', () => {}, {
			contactOutcome: outcome,
		});

		expect(outcome.succeeded).toHaveBeenCalledExactlyOnceWith('fine');
		expect(outcome.failed).not.toHaveBeenCalled();
	});
});

describe('DaemonSourceContact - keeps the last contact error of each source', () => {
	function contact(entries: ReturnType<typeof entry>[]) {
		const sources = {
			list: () => entries,
			pruneDead: () => [] as string[],
		};
		return new DaemonSourceContact(
			'C:/logs-unused',
			sources as never,
			{ find: () => undefined } as never,
			new LaunchTokenIssuer(),
			new WorkerTypeInstances(new PluginLoader(), () => {})
		);
	}

	it('records a failing source, and forgets it after a later success', async () => {
		const sourceEntries = [entry('laptop', 'built-in:command', {})];
		const daemonContact = contact(sourceEntries);

		daemonContact.contactSources(4101);
		await vi.waitFor(() => {
			expect(daemonContact.contactErrors.since(new Set(['laptop']), 0)).toHaveLength(1);
		});

		sourceEntries[0] = entry('laptop', 'built-in:inbound');
		daemonContact.contactSources(4101);
		await vi.waitFor(() => {
			expect(daemonContact.contactErrors.since(new Set(['laptop']), 0)).toEqual([]);
		});
	});

	it('forgets the error of a source that is no longer declared', async () => {
		const sourceEntries = [entry('laptop', 'built-in:command', {})];
		const daemonContact = contact(sourceEntries);
		daemonContact.contactSources(4101);
		await vi.waitFor(() => {
			expect(daemonContact.contactErrors.since(new Set(['laptop']), 0)).toHaveLength(1);
		});

		sourceEntries.length = 0;
		daemonContact.contactSources(4101);

		expect(daemonContact.contactErrors.since(new Set(['laptop']), 0)).toEqual([]);
	});
});
