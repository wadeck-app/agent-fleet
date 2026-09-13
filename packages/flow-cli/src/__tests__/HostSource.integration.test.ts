/**
 * A host supplying workers, exercised over a real WebSocket (Phase 4b).
 *
 * The peer is a second *process-less* participant on loopback, not a second machine. That
 * limit is real and worth naming: it proves the protocol, the credential separation and the
 * refusal paths, but it cannot prove anything about reaching another host over a network.
 * The encrypted-transport half is covered separately (`WebSocketServer.test.ts`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { HostRegistry } from '../daemon/HostRegistry';
import { HostWorkerSource } from '../daemon/HostWorkerSource';
import { WebSocketServer } from '../daemon/WebSocketServer';
import { WorkerSourceRegistry } from '../daemon/WorkerSourceRegistry';
import type { SourceToDaemon } from '../ipc/Protocol';

let dir: string;
let server: WebSocketServer | undefined;
let client: WebSocket | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'host-source-'));
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
	hosts: HostRegistry;
	sources: WorkerSourceRegistry;
	peer: WebSocket;
	peerMessages: Record<string, unknown>[];
	serverSocketFor: () => Promise<void>;
}> {
	const sources = new WorkerSourceRegistry(dir);
	const hosts = new HostRegistry(sources);
	const received: { ws: unknown; message: Record<string, unknown> }[] = [];

	server = new WebSocketServer(
		46_101,
		(ws, message) => {
			received.push({ ws, message: message as unknown as Record<string, unknown> });
			const asSource = message as unknown as { type?: string };
			if (asSource.type === 'source_ready') {
				const admission = hosts.register(ws, message as never);
				if (!admission.ok) ws.terminate();
			}
		},
		ws => hosts.remove(ws)
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
		hosts,
		sources,
		peer,
		peerMessages,
		serverSocketFor: async () => {
			await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));
		},
	};
}

describe('a host registering as a source', () => {
	it('is admitted with the source token and appears as reachable', async () => {
		const { hosts, sources, peer } = await connectPeer();
		const { sourceToken } = sources.declare({
			sourceId: 'build-box',
			provider: 'built-in:host',
			labels: [],
			maxWorkers: 2,
		});

		peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'build-box', sourceToken, capacity: 2 }));
		await vi.waitFor(() => expect(hosts.find('build-box')).toBeDefined());

		expect(hosts.find('build-box')?.capacity).toBe(2);
	});

	// The property the credential split exists for, end to end: the worker token is useless
	// for claiming to *be* the source (T-04, T-11).
	it('is refused and disconnected when it presents the worker token', async () => {
		const { hosts, sources, peer } = await connectPeer();
		const { token } = sources.declare({
			sourceId: 'build-box',
			provider: 'built-in:host',
			labels: [],
			maxWorkers: 2,
		});
		const closed = new Promise<void>(resolve => peer.once('close', () => resolve()));

		peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'build-box', sourceToken: token, capacity: 2 }));
		await closed;

		expect(hosts.find('build-box')).toBeUndefined();
	});

	it('is refused when the source was never declared', async () => {
		const { hosts, peer } = await connectPeer();
		const closed = new Promise<void>(resolve => peer.once('close', () => resolve()));

		peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'ghost', sourceToken: 'anything', capacity: 1 }));
		await closed;

		expect(hosts.liveCount).toBe(0);
	});
});

describe('asking a registered host for a worker', () => {
	/** Registers the peer as a host and returns the pieces needed to ask it for a worker. */
	async function registeredHost() {
		const context = await connectPeer();
		const { sourceToken } = context.sources.declare({
			sourceId: 'build-box',
			provider: 'built-in:host',
			labels: [],
			maxWorkers: 2,
		});
		context.peer.send(JSON.stringify({ type: 'source_ready', sourceId: 'build-box', sourceToken, capacity: 2 }));
		await vi.waitFor(() => expect(context.hosts.find('build-box')).toBeDefined());
		return context;
	}

	it('reaches the host, which can accept', async () => {
		const { hosts, peer, peerMessages } = await registeredHost();
		peer.on('message', (data: Buffer) => {
			const message = JSON.parse(data.toString()) as { type: string; requestId: string };
			if (message.type !== 'provide_worker') return;
			const ack: SourceToDaemon = { type: 'provide_worker_ack', requestId: message.requestId, accepted: true };
			peer.send(JSON.stringify(ack));
		});
		const source = new HostWorkerSource(id => hosts.find(id), { timeoutMs: 2_000 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: ['C:/proj'] })
		).resolves.toBeUndefined();

		// What the host received carries demand only: no command, no script, no path (D#19).
		const demand = peerMessages.find(m => m['type'] === 'provide_worker');
		expect(demand).toBeDefined();
		expect(Object.keys(demand!).sort()).toEqual(['labels', 'projects', 'requestId', 'type']);
	});

	it('surfaces the host declining, rather than reporting capacity that is not coming', async () => {
		const { hosts, peer } = await registeredHost();
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
		const source = new HostWorkerSource(id => hosts.find(id), { timeoutMs: 2_000 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: [] })
		).rejects.toThrow(/all builders busy/);
	});

	// One unresponsive machine must not hold up provisioning for everyone else (D#66).
	it('gives up on a host that stays silent', async () => {
		const { hosts } = await registeredHost();
		const source = new HostWorkerSource(id => hosts.find(id), { timeoutMs: 60 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: [] })
		).rejects.toThrow(/did not answer/);
	});

	it('reports a host that has disconnected as unreachable, not as unproductive', async () => {
		const { hosts, peer } = await registeredHost();
		peer.close();
		await vi.waitFor(() => expect(hosts.find('build-box')).toBeUndefined());
		const source = new HostWorkerSource(id => hosts.find(id), { timeoutMs: 500 });

		await expect(
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:0', sourceId: 'build-box', projects: [] })
		).rejects.toThrow(/no host connected/);
	});
});
