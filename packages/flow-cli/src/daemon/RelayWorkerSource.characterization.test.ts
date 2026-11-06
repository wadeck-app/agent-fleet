import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { RegisteredRelay } from './RelayRegistry.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

/**
 * Pins what a declared `built-in:relay` source does TODAY, through the same entry point the daemon uses
 * (`contactDeclaredSources`), so that moving the relay behind the worker-type contract cannot change it unnoticed.
 */

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'relay-characterization-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function fakeRelay(answer: { accepted: boolean; reason?: string }): {
	relay: RegisteredRelay;
	sent: Record<string, unknown>[];
} {
	const sent: Record<string, unknown>[] = [];
	const handlers: ((data: Buffer) => void)[] = [];
	const ws = {
		send: (raw: string) => {
			const message = JSON.parse(raw) as Record<string, unknown>;
			sent.push(message);
			setImmediate(() => {
				for (const handler of handlers) {
					handler(
						Buffer.from(
							JSON.stringify({ type: 'provide_worker_ack', requestId: message['requestId'], ...answer })
						)
					);
				}
			});
		},
		on: (event: string, handler: (data: Buffer) => void) => {
			if (event === 'message') handlers.push(handler);
		},
		off: vi.fn(),
	} as unknown as WebSocket;
	return { relay: { ws, sourceId: 'build-box', capacity: 2 }, sent };
}

/** Declares a relay source through the registry, so the entry is exactly what the daemon reads back from disk. */
function declaredRelay(options?: Record<string, unknown>) {
	const registry = new WorkerSourceRegistry(dir);
	registry.declare({
		sourceId: 'build-box',
		provider: 'built-in:relay',
		labels: [],
		maxWorkers: 2,
		...(options !== undefined ? { options } : {}),
	});
	return new WorkerSourceRegistry(dir).list();
}

async function contact(
	entries: ReturnType<typeof declaredRelay>,
	dependencies: Parameters<typeof contactDeclaredSources>[3]
): Promise<string[]> {
	const reported: string[] = [];
	await contactDeclaredSources(entries, 'ws://127.0.0.1:4101', message => reported.push(message), dependencies);
	return reported;
}

describe('a declared built-in:relay source - characterization', () => {
	it('asks its connected relay for one worker, with demand only: no projects, no labels, nothing executable', async () => {
		const { relay, sent } = fakeRelay({ accepted: true });

		const reported = await contact(declaredRelay(), { findRelay: () => relay });

		expect(reported).toEqual([]);
		expect(sent).toHaveLength(1);
		expect(Object.keys(sent[0]!).sort()).toEqual(['labels', 'projects', 'requestId', 'type']);
		expect(sent[0]).toMatchObject({ type: 'provide_worker', projects: [], labels: [] });
	});

	it('looks the relay up by the declared source id', async () => {
		const { relay } = fakeRelay({ accepted: true });
		const findRelay = vi.fn(() => relay);

		await contact(declaredRelay(), { findRelay });

		expect(findRelay).toHaveBeenCalledExactlyOnceWith('build-box');
	});

	// Declaration refuses a command, and any other option is not part of what travels to the relay.
	it('refuses a command at declaration, and sends no option to the relay', async () => {
		expect(() => declaredRelay({ command: 'rm -rf /' })).toThrow(/never runs one/);
		const { relay, sent } = fakeRelay({ accepted: true });

		const reported = await contact(declaredRelay({ image: 'node:22' }), { findRelay: () => relay });

		expect(reported).toEqual([]);
		expect(JSON.stringify(sent)).not.toContain('node:22');
	});

	it('still refuses a literal credential in its options when declared', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() =>
			registry.declare({
				sourceId: 'build-box',
				provider: 'built-in:relay',
				labels: [],
				maxWorkers: 1,
				options: { token: 'abc123' },
			})
		).toThrow(/Literal credential value/);
	});

	it('reports a relay that declined, naming the source and carrying its reason', async () => {
		const { relay } = fakeRelay({ accepted: false, reason: 'out of capacity' });

		const reported = await contact(declaredRelay(), { findRelay: () => relay });

		expect(reported).toHaveLength(1);
		expect(reported[0]).toBe(
			'could not obtain a worker from source "build-box": source "build-box" declined to provide a worker: out of capacity'
		);
	});

	it('reports an absent relay with what to do', async () => {
		const reported = await contact(declaredRelay(), { findRelay: () => undefined });

		expect(reported).toHaveLength(1);
		expect(reported[0]).toBe(
			'could not obtain a worker from source "build-box": source "build-box" has no relay connected, so it cannot be asked for a worker. A relay dials the daemon itself -- start it on that machine and check it registered with "flow worker source list".'
		);
	});

	it('reports a daemon wired without a relay registry as a wiring mistake, not a configuration error', async () => {
		const reported = await contact(declaredRelay(), {});

		expect(reported).toHaveLength(1);
		expect(reported[0]).toBe(
			'could not obtain a worker from source "build-box": provider built-in:relay needs the daemon\'s relay registry, which was not supplied. This is a wiring mistake in the daemon, not a configuration error -- please report it.'
		);
	});

	// An entry written by an older flow: no plugin, no pluginsDir, no options. It must keep loading and answering.
	it('serves an entry from an old worker-sources.json that predates the plugin fields', async () => {
		writeFileSync(
			join(dir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'build-box',
						provider: 'built-in:relay',
						labels: [],
						maxWorkers: 2,
						tokenHash: 'deadbeef',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			}),
			'utf8'
		);
		const { relay, sent } = fakeRelay({ accepted: true });

		const entries = new WorkerSourceRegistry(dir).list();
		const reported = await contact(entries, { findRelay: () => relay });

		expect(entries.map(entry => entry.provider)).toEqual(['built-in:relay']);
		expect(reported).toEqual([]);
		expect(sent).toHaveLength(1);
	});
});
