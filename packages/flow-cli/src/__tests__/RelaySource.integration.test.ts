/**
 * A relay supplying workers, exercised over a real WebSocket (Phase 4b).
 *
 * The peer is a second *process-less* participant on loopback, not a relay on another machine.
 * That limit is real and worth naming: it proves the protocol, the credential separation and the
 * refusal paths, but it cannot prove anything about reaching a relay over a network.
 * The encrypted-transport half is covered separately (`WebSocketServer.test.ts`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { RelayRegistry } from '../daemon/RelayRegistry';
import { RelayWorkerSource } from '../daemon/RelayWorkerSource';
import { WebSocketServer } from '../daemon/WebSocketServer';
import { WorkerSourceRegistry } from '../daemon/WorkerSourceRegistry';
import type { SourceToDaemon } from '../ipc/Protocol';

let dir: string;
let server: WebSocketServer | undefined;
let client: WebSocket | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'relay-source-'));
});

afterEach(() => {
	client?.close();
	client = undefined;
	server?.close();
	server = undefined;
	rmSync(dir, { recursive: true, force: true });
});

/** Stands up the daemon side and a connected peer, returning both ends. */
async function connectPeer(): Promise<{
	relays: RelayRegistry;
	sources: WorkerSourceRegistry;
	peer: WebSocket;
	peerMessages: Record<string, unknown>[];
	serverSocketFor: () => Promise<void>;
}> {
	const sources = new WorkerSourceRegistry(dir);
	const relays = new RelayRegistry(sources);
	const received: { ws: unknown; message: Record<string, unknown> }[] = [];

	server = new WebSocketServer(
		46_101,
		(ws, message) => {
			received.push({ ws, message: message as unknown as Record<string, unknown> });
			const asSource = message as unknown as { type?: string };
			if (asSource.type === 'source_ready') {
				const admission = relays.register(ws, message as never);
				if (!admission.ok) ws.terminate();
			}
		},
		ws => relays.remove(ws)
	);
	const port = await server.start();

	const peer = new WebSocket(`ws://127.0.0.1:${String(port)}`);
	const peerMessages: Record<string, unknown>[] = [];
	peer.on('message', (data: Buffer) => peerMessages.push(JSON.parse(data.toString()) as Record<string, unknown>));
	await new Promise<void>((resolve, reject) => {
		peer.once('open', () => resolve());
		peer.once('error', reject);
	});
	client = peer;

	return {
		relays,
		sources,
		peer,
		peerMessages,
		serverSocketFor: async () => {
			await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));
		},
	};
}

describe('a relay registering as a source', () => {
	it('is admitted with the source token and appears as reachable', async () => {
		const { relays, sources, peer } = await connectPeer();
		const { sourceToken } = sources.declare({
			sourceId: 'build-box',
			provider: 'built-in:relay',
			labels: [],
			maxWorkers: 2,
		});

		peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'build-box', sourceToken, capacity: 2 }));
		await vi.waitFor(() => expect(relays.find('build-box')).toBeDefined());

		expect(relays.find('build-box')?.capacity).toBe(2);
	});

	// The property the credential split exists for, end to end: the worker token is useless
	// for claiming to *be* the source (T-04, T-11).
	it('is refused and disconnected when it presents the worker token', async () => {
		const { relays, sources, peer } = await connectPeer();
		const { token } = sources.declare({
			sourceId: 'build-box',
			provider: 'built-in:relay',
			labels: [],
			maxWorkers: 2,
		});
		const closed = new Promise<void>(resolve => peer.once('close', () => resolve()));

		peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'build-box', sourceToken: token, capacity: 2 }));
		await closed;

		expect(relays.find('build-box')).toBeUndefined();
	});

	it('is refused when the source was never declared', async () => {
		const { relays, peer } = await connectPeer();
		const closed = new Promise<void>(resolve => peer.once('close', () => resolve()));

		peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'ghost', sourceToken: 'anything', capacity: 1 }));
		await closed;

		expect(relays.liveCount).toBe(0);
	});
});

describe('asking a registered relay for a worker', () => {
	/** Registers the peer as a relay and returns the pieces needed to ask it for a worker. */
	async function registeredRelay() {
		const context = await connectPeer();
		const { sourceToken } = context.sources.declare({
			sourceId: 'build-box',
			provider: 'built-in:relay',
			labels: [],
			maxWorkers: 2,
		});
		context.peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'build-box', sourceToken, capacity: 2 }));
		await vi.waitFor(() => expect(context.relays.find('build-box')).toBeDefined());
		return context;
	}

	it('reaches the relay, which can accept', async () => {
		const { relays, peer, peerMessages } = await registeredRelay();
		peer.on('message', (data: Buffer) => {
			const message = JSON.parse(data.toString()) as { type: string; requestId: string };
			if (message.type !== 'provide_worker') return;
			const ack: SourceToDaemon = { type: 'provide_worker_ack', requestId: message.requestId, accepted: true };
			peer.send(JSON.stringify(ack));
		});
		const source = new RelayWorkerSource(id => relays.find(id), { timeoutMs: 2_000 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: ['C:/proj'] })
		).resolves.toBeUndefined();

		// What the relay received carries demand only: no command, no script, no path (D#19).
		const demand = peerMessages.find(m => m['type'] === 'provide_worker');
		expect(demand).toBeDefined();
		expect(Object.keys(demand!).sort()).toEqual(['labels', 'projects', 'requestId', 'type']);
	});

	it('surfaces the relay declining, rather than reporting capacity that is not coming', async () => {
		const { relays, peer } = await registeredRelay();
		peer.on('message', (data: Buffer) => {
			const message = JSON.parse(data.toString()) as { type: string; requestId: string };
			if (message.type !== 'provide_worker') return;
			peer.send(
				JSON.stringify({
					type: 'provide_worker_ack',
					requestId: message.requestId,
					accepted: false,
					reason: 'all builders busy',
				})
			);
		});
		const source = new RelayWorkerSource(id => relays.find(id), { timeoutMs: 2_000 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: [] })
		).rejects.toThrow(/all builders busy/);
	});

	// One unresponsive relay must not hold up provisioning for everyone else (D#66).
	it('gives up on a relay that stays silent', async () => {
		const { relays } = await registeredRelay();
		const source = new RelayWorkerSource(id => relays.find(id), { timeoutMs: 60 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: [] })
		).rejects.toThrow(/did not answer/);
	});

	it('reports a relay that has disconnected as unreachable, not as unproductive', async () => {
		const { relays, peer } = await registeredRelay();
		peer.close();
		await vi.waitFor(() => expect(relays.find('build-box')).toBeUndefined());
		const source = new RelayWorkerSource(id => relays.find(id), { timeoutMs: 500 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: [] })
		).rejects.toThrow(/no relay connected/);
	});
});
