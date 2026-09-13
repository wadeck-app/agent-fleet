import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { RegisteredHost } from './HostRegistry.js';
import { HostWorkerSource } from './HostWorkerSource.js';

const request = { daemonEndpoint: 'wss://daemon:4101', sourceId: 'build-box', projects: ['C:/proj'] };

/** A host whose answer to `provide_worker` the test controls. */
function fakeHost(answer: { accepted: boolean; reason?: string } | 'silent'): {
	host: RegisteredHost;
	sent: Record<string, unknown>[];
} {
	const sent: Record<string, unknown>[] = [];
	const handlers: ((data: Buffer) => void)[] = [];
	const ws = {
		readyState: 1,
		OPEN: 1,
		send: (raw: string) => {
			const message = JSON.parse(raw) as Record<string, unknown>;
			sent.push(message);
			if (answer === 'silent') return;
			// Answers on the next tick, as a real peer would.
			setTimeout(() => {
				for (const handler of handlers) {
					handler(
						Buffer.from(
							JSON.stringify({ type: 'provide_worker_ack', requestId: message['requestId'], ...answer })
						)
					);
				}
			}, 0);
		},
		on: (event: string, handler: (data: Buffer) => void) => {
			if (event === 'message') handlers.push(handler);
		},
		off: vi.fn(),
		removeListener: vi.fn(),
	} as unknown as WebSocket;

	return { host: { ws, sourceId: 'build-box', capacity: 2 }, sent };
}

describe('HostWorkerSource - asking a host for a worker (D#52, D#53)', () => {
	it('asks the connected host and resolves when it accepts', async () => {
		const { host, sent } = fakeHost({ accepted: true });
		const source = new HostWorkerSource(() => host, { timeoutMs: 500 });

		await expect(source.obtainWorker(request)).resolves.toBeUndefined();
		expect(sent).toHaveLength(1);
		expect(sent[0]!['type']).toBe('provide_worker');
	});

	// D#19/D#20/T-13: the daemon publishes demand. It never says how to make a worker, so a
	// compromised daemon cannot make every connected machine run something of its choosing.
	it('sends nothing executable -- no command, script or path', async () => {
		const { host, sent } = fakeHost({ accepted: true });
		const source = new HostWorkerSource(() => host, { timeoutMs: 500 });

		await source.obtainWorker(request);

		const message = sent[0]!;
		expect(Object.keys(message).sort()).toEqual(['labels', 'projects', 'requestId', 'type']);
	});

	it('tells the host which projects the worker must serve', async () => {
		const { host, sent } = fakeHost({ accepted: true });
		const source = new HostWorkerSource(() => host, { timeoutMs: 500 });

		await source.obtainWorker(request);

		expect(sent[0]!['projects']).toEqual(['C:/proj']);
	});

	// Declining is normal -- at capacity, or cannot reach the project -- but it must not look
	// like success, or the caller would count capacity that is never coming.
	it('rejects when the host declines, carrying its reason', async () => {
		const { host } = fakeHost({ accepted: false, reason: 'at capacity' });
		const source = new HostWorkerSource(() => host, { timeoutMs: 500 });

		await expect(source.obtainWorker(request)).rejects.toThrow(/at capacity/);
	});

	it('names the source in its failure, since several may be declared', async () => {
		const { host } = fakeHost({ accepted: false, reason: 'nope' });
		const source = new HostWorkerSource(() => host, { timeoutMs: 500 });

		await expect(source.obtainWorker(request)).rejects.toThrow(/build-box/);
	});

	// The wait is bounded so one unresponsive machine cannot hold up provisioning (D#66).
	it('gives up when the host never answers', async () => {
		const { host } = fakeHost('silent');
		const source = new HostWorkerSource(() => host, { timeoutMs: 20 });

		await expect(source.obtainWorker(request)).rejects.toThrow(/did not answer|timed out/i);
	});

	// A declared host that is simply not connected is the ordinary case, not a crash: the
	// registry records intent, and only a connection proves reachability (D#4).
	it('rejects with something actionable when no host is connected for the source', async () => {
		const source = new HostWorkerSource(() => undefined, { timeoutMs: 500 });

		await expect(source.obtainWorker(request)).rejects.toThrow(/not connected|no host/i);
	});
});
