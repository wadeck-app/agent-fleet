import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

import { ObservedList } from '../testing/ObservedList';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { DaemonLink } from './DaemonLink';
import { type JsonObject, MAX_FRAME_BYTES } from './HarnessMessages';

let server: WebSocketServer;
let serverSockets: ObservedList<WebSocket>;
let serverReceived: ObservedList<string>;
let log: RecordingSandboxLog;
let messages: ObservedList<JsonObject>;
let closes: ObservedList<{ code: number; reason: string }>;

beforeEach(async () => {
	// The server and the links of this test only ever touch the lists of this test (an earlier link may report late).
	const ownSockets = new ObservedList<WebSocket>();
	const ownReceived = new ObservedList<string>();
	serverSockets = ownSockets;
	serverReceived = ownReceived;
	messages = new ObservedList<JsonObject>();
	closes = new ObservedList<{ code: number; reason: string }>();
	log = new RecordingSandboxLog();
	server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	await new Promise<void>(resolve => server.once('listening', resolve));
	server.on('connection', socket => {
		ownSockets.push(socket);
		socket.on('message', data => ownReceived.push(data.toString()));
	});
});

afterEach(async () => {
	for (const socket of serverSockets.items) socket.terminate();
	await new Promise<void>(resolve => server.close(() => resolve()));
});

function link(url = `ws://127.0.0.1:${(server.address() as { port: number }).port}`): DaemonLink {
	const ownMessages = messages;
	const ownCloses = closes;
	return new DaemonLink({
		url,
		log,
		onMessage: message => ownMessages.push(message),
		onClosed: (code, reason) => ownCloses.push({ code, reason }),
	});
}

function serverSocket(): WebSocket {
	const socket = serverSockets.items[0];
	if (socket === undefined) throw new Error('The server saw no connection yet.');
	return socket;
}

/** Connects, and waits until the server also saw the connection (its event can come after the client's open). */
async function connected(daemon: DaemonLink): Promise<void> {
	await daemon.connect();
	await serverSockets.waitForCount(1);
}

describe('DaemonLink', () => {
	it('connects, sends JSON and delivers the JSON objects the daemon sends', async () => {
		const daemon = link();
		await connected(daemon);

		daemon.send({ type: 'ready', pid: 1 });
		serverSocket().send(JSON.stringify({ type: 'assign', assignmentId: 'a' }));

		await Promise.all([serverReceived.waitForCount(1), messages.waitForCount(1)]);
		expect(JSON.parse(serverReceived.items[0] ?? '')).toEqual({ type: 'ready', pid: 1 });
		expect(messages.items).toEqual([{ type: 'assign', assignmentId: 'a' }]);
		expect(daemon.isOpen).toBe(true);
		daemon.close();
	});

	it('ignores binary frames, text that is not JSON and JSON that is not an object, and says so', async () => {
		const daemon = link();
		await connected(daemon);

		serverSocket().send(Buffer.from([1, 2]));
		serverSocket().send('not json');
		serverSocket().send('[1]');
		serverSocket().send('{"type":"idle"}');

		await messages.waitForCount(1);
		expect(messages.items).toEqual([{ type: 'idle' }]);
		expect(log.text()).toContain('binary frame');
		expect(log.text()).toContain('not JSON');
		expect(log.text()).toContain('not a JSON object');
		daemon.close();
	});

	it('reports the close with its code, and refuses to send after it, naming the message, instead of dropping it', async () => {
		const daemon = link();
		await connected(daemon);

		serverSocket().close(4001, 'refused');

		await closes.waitForCount(1);
		expect(closes.items[0]).toEqual({ code: 4001, reason: 'refused' });
		expect(daemon.isOpen).toBe(false);
		expect(() => daemon.send({ type: 'step_failed' })).toThrow('Cannot send a "step_failed" message');
	});

	it('refuses a frame above the daemon limit', async () => {
		const daemon = link();
		await connected(daemon);

		expect(() => daemon.send({ type: 'log', entry: 'x'.repeat(MAX_FRAME_BYTES) })).toThrow(
			'exceeds the 1048576-byte limit'
		);
		daemon.close();
	});

	it('fails to connect with the URL and what to do', async () => {
		const closed = new WebSocketServer({ host: '127.0.0.1', port: 0 });
		await new Promise<void>(resolve => closed.once('listening', resolve));
		const port = (closed.address() as { port: number }).port;
		await new Promise<void>(resolve => closed.close(() => resolve()));

		await expect(link(`ws://127.0.0.1:${port}`).connect()).rejects.toThrow(
			new RegExp(`ws://127\\.0\\.0\\.1:${port}[\\s\\S]*started by the daemon`)
		);
	});
});
