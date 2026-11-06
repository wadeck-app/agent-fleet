import { once } from 'node:events';
import type { IncomingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { ObservedList } from '../../testing/ObservedList';
import { InnerBridgeShim, type WorkerProcess } from './InnerBridgeShim';

let host: WebSocketServer;
let hostSockets: ObservedList<WebSocket>;
let hostHeaders: IncomingHttpHeaders[];
let hostRefusal: number | undefined;
let lines: string[];
const fakeWorkers: WebSocket[] = [];

beforeEach(async () => {
	const ownSockets = new ObservedList<WebSocket>();
	hostSockets = ownSockets;
	hostHeaders = [];
	hostRefusal = undefined;
	lines = [];
	host = new WebSocketServer({
		host: '127.0.0.1',
		port: 0,
		verifyClient: (info, accept) => {
			hostHeaders.push(info.req.headers);
			if (hostRefusal !== undefined) accept(false, hostRefusal, 'refused');
			else accept(true);
		},
	});
	await new Promise<void>(resolve => host.once('listening', resolve));
	host.on('connection', socket => ownSockets.push(socket));
});

afterEach(async () => {
	for (const worker of fakeWorkers.splice(0)) worker.terminate();
	for (const socket of hostSockets.items) socket.terminate();
	await new Promise<void>(resolve => host.close(() => resolve()));
});

function hostUrl(): string {
	return `ws://127.0.0.1:${(host.address() as { port: number }).port}/`;
}

function hostSocket(): WebSocket {
	const socket = hostSockets.items[0];
	if (socket === undefined) throw new Error('The shim never connected to the host.');
	return socket;
}

/** A worker stand-in: connects to the shim's local port like worker.cjs does, and can "exit". */
function fakeWorkerFactory(): {
	spawnWorker: (port: number) => WorkerProcess;
	received: ObservedList<string>;
	/** One entry per connection of the worker to the shim that reached the open state. */
	opened: ObservedList<WebSocket>;
	exit: (code: number) => void;
	killed: () => boolean;
	socket: () => WebSocket;
} {
	const received = new ObservedList<string>();
	const opened = new ObservedList<WebSocket>();
	let exitCallback: ((code: number | null) => void) | undefined;
	let socket: WebSocket | undefined;
	let killed = false;
	return {
		received,
		opened,
		killed: () => killed,
		socket: () => {
			if (socket === undefined) throw new Error('the fake worker has not connected');
			return socket;
		},
		exit: code => exitCallback?.(code),
		spawnWorker: port => {
			const connection = new WebSocket(`ws://127.0.0.1:${port}`);
			socket = connection;
			fakeWorkers.push(connection);
			connection.on('error', () => undefined);
			connection.on('open', () => opened.push(connection));
			connection.on('message', data => received.push(data.toString()));
			return {
				onExit: callback => {
					exitCallback = callback;
				},
				kill: () => {
					killed = true;
				},
			};
		},
	};
}

describe('InnerBridgeShim', () => {
	it('sends the token in the x-flow-bridge-token header and starts the worker once connected', async () => {
		const worker = fakeWorkerFactory();
		const shim = new InnerBridgeShim({
			bridgeUrl: hostUrl(),
			token: 'flow-ph-placeholder',
			spawnWorker: worker.spawnWorker,
			log: line => lines.push(line),
		});

		const done = shim.run();
		await Promise.all([hostSockets.waitForCount(1), worker.opened.waitForCount(1)]);
		worker.exit(0);

		expect(await done).toBe(0);
		expect(hostHeaders[0]?.['x-flow-bridge-token']).toBe('flow-ph-placeholder');
	});

	it('relays frames in both directions, in order', async () => {
		const worker = fakeWorkerFactory();
		const shim = new InnerBridgeShim({
			bridgeUrl: hostUrl(),
			token: 'flow-ph-placeholder',
			spawnWorker: worker.spawnWorker,
			log: line => lines.push(line),
		});
		const done = shim.run();
		await Promise.all([hostSockets.waitForCount(1), worker.opened.waitForCount(1)]);
		const hostReceived = new ObservedList<string>();
		hostSocket().on('message', data => hostReceived.push(data.toString()));

		hostSocket().send('{"type":"assign","n":1}');
		hostSocket().send('{"type":"assign","n":2}');
		worker.socket().send('{"type":"ready"}');

		await Promise.all([worker.received.waitForCount(2), hostReceived.waitForCount(1)]);
		expect(worker.received.items).toEqual(['{"type":"assign","n":1}', '{"type":"assign","n":2}']);
		expect(hostReceived.items).toEqual(['{"type":"ready"}']);
		worker.exit(0);
		await done;
	});

	it('queues what the bridge sends before the worker is connected', async () => {
		const received = new ObservedList<string>();
		let exitCallback: ((code: number | null) => void) | undefined;
		let localPort = 0;
		const spawned = new ObservedList<number>();
		const shim = new InnerBridgeShim({
			bridgeUrl: hostUrl(),
			token: 'flow-ph-placeholder',
			spawnWorker: port => {
				localPort = port;
				spawned.push(port);
				return { onExit: callback => (exitCallback = callback), kill: () => undefined };
			},
			log: line => lines.push(line),
		});
		const done = shim.run();
		await Promise.all([hostSockets.waitForCount(1), spawned.waitForCount(1)]);
		// A ping behind the frame is a barrier: the shim answers it only after it has handled the frame before it.
		const pong = once(hostSocket(), 'pong');
		hostSocket().send('first');
		hostSocket().ping();
		await pong;

		const late = new WebSocket(`ws://127.0.0.1:${localPort}`);
		fakeWorkers.push(late);
		late.on('error', () => undefined);
		late.on('message', data => received.push(data.toString()));

		await received.waitForCount(1);
		expect(received.items).toEqual(['first']);
		exitCallback?.(0);
		await done;
	});

	it('exits with the code of the worker and kills it when the bridge closes', async () => {
		const worker = fakeWorkerFactory();
		const shim = new InnerBridgeShim({
			bridgeUrl: hostUrl(),
			token: 'flow-ph-placeholder',
			spawnWorker: worker.spawnWorker,
			log: line => lines.push(line),
		});
		const done = shim.run();
		await Promise.all([hostSockets.waitForCount(1), worker.opened.waitForCount(1)]);

		hostSocket().close();

		expect(await done).toBe(1);
		expect(worker.killed()).toBe(true);
	});

	it('explains a refusal (HTTP 401, 409) of the bridge and exits 1 without starting the worker', async () => {
		const refusals: [number, string][] = [
			[401, 'token placeholder was not substituted'],
			[409, 'another connection is open'],
		];
		for (const [status, hint] of refusals) {
			hostRefusal = status;
			lines = [];
			let started = false;
			const shim = new InnerBridgeShim({
				bridgeUrl: hostUrl(),
				token: 'flow-ph-placeholder',
				spawnWorker: () => {
					started = true;
					return { onExit: () => undefined, kill: () => undefined };
				},
				log: line => lines.push(line),
			});

			expect(await shim.run(), String(status)).toBe(1);
			expect(started, String(status)).toBe(false);
			expect(lines.join('\n'), String(status)).toContain('could not be reached or refused the connection');
			expect(lines.join('\n'), String(status)).toContain(hint);
		}
	});
});
