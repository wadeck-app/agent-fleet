import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { ObservedList } from '../testing/ObservedList';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { BRIDGE_TOKEN_HEADER, BridgeTokenGuard } from './BridgeTokenGuard';
import { HarnessBridge } from './HarnessBridge';
import { MAX_FRAME_BYTES } from './HarnessMessages';

const TOKEN = 't'.repeat(40);

let log: RecordingSandboxLog;
let tokens: BridgeTokenGuard;
/** The frames handed to the guard callback. */
let frames: ObservedList<string>;
/** One entry per end of the inner connection reported by the bridge. */
let innerClosed: ObservedList<true>;
let bridge: HarnessBridge;
const clients: WebSocket[] = [];

beforeEach(async () => {
	log = new RecordingSandboxLog();
	tokens = new BridgeTokenGuard();
	tokens.expect(TOKEN);
	// The handlers keep the lists of THEIR bridge: a bridge stopped by the previous test may still report its close.
	const ownFrames = new ObservedList<string>();
	const ownClosed = new ObservedList<true>();
	frames = ownFrames;
	innerClosed = ownClosed;
	bridge = new HarnessBridge({
		tokens,
		log,
		onFrame: raw => ownFrames.push(raw),
		onInnerClosed: () => ownClosed.push(true),
	});
	await bridge.start();
});

afterEach(async () => {
	for (const client of clients.splice(0)) client.terminate();
	await bridge.stop();
});

/** Resolves with the opened socket, or the HTTP status of the refused upgrade. */
function open(url: string, headers: Record<string, string> = {}): Promise<WebSocket | number> {
	return new Promise(resolve => {
		const client = new WebSocket(url, { headers });
		clients.push(client);
		client.once('open', () => resolve(client));
		client.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
		client.once('error', () => undefined);
	});
}

function connect(headers: Record<string, string>): Promise<WebSocket | number> {
	return open(`ws://127.0.0.1:${bridge.port}/`, headers);
}

async function connected(): Promise<WebSocket> {
	const result = await connect({ [BRIDGE_TOKEN_HEADER]: TOKEN });
	if (typeof result === 'number') throw new Error(`refused with ${result}`);
	await bridge.waitForInner(2000);
	return result;
}

describe('HarnessBridge authentication', () => {
	it('listens on the loopback interface only', () => {
		expect(bridge.port).toBeGreaterThan(0);
		expect(log.text()).toContain(`bridge listening on 127.0.0.1:${bridge.port}`);
	});

	it('accepts the right token header', async () => {
		await connected();

		expect(bridge.hasInner).toBe(true);
	});

	it('refuses no token, a wrong token, the placeholder text, a token in the query string (not substituted by the proxy) and a revoked token with 401 and logs why', async () => {
		const cases: [string, Record<string, string>][] = [
			['no token', {}],
			['a wrong token', { [BRIDGE_TOKEN_HEADER]: 'w'.repeat(40) }],
			['the placeholder text', { [BRIDGE_TOKEN_HEADER]: 'flow-ph-0123456789abcdef' }],
		];
		for (const [label, headers] of cases) {
			expect(await connect(headers), label).toBe(401);
			expect(bridge.hasInner, label).toBe(false);
		}
		expect(log.text()).toContain('bridge refused a connection');

		expect(await open(`ws://127.0.0.1:${bridge.port}/?token=${TOKEN}`), 'a token in the query string').toBe(401);

		tokens.revoke();
		expect(await connect({ [BRIDGE_TOKEN_HEADER]: TOKEN }), 'a revoked token').toBe(401);
	});

	it('refuses a second connection with the right token while one is open, and keeps the first', async () => {
		const first = await connected();

		const second = await connect({ [BRIDGE_TOKEN_HEADER]: TOKEN });

		expect(second).toBe(409);
		expect(first.readyState).toBe(WebSocket.OPEN);
		expect(log.text()).toContain('second inner connection');
	});

	it('accepts a new connection after the first one closed', async () => {
		const first = await connected();
		first.close();
		await innerClosed.waitForCount(1);

		const second = await connect({ [BRIDGE_TOKEN_HEADER]: TOKEN });

		expect(typeof second).not.toBe('number');
	});
});

describe('HarnessBridge frames', () => {
	it('hands text frames to the guard callback and sends JSON to the inner worker', async () => {
		const client = await connected();
		const received = new ObservedList<string>();
		client.on('message', data => received.push(data.toString()));

		client.send('{"type":"ready"}');
		bridge.send({ type: 'assign', n: 1 });

		await Promise.all([frames.waitForCount(1), received.waitForCount(1)]);
		expect(frames.items).toEqual(['{"type":"ready"}']);
		expect(JSON.parse(received.items[0] ?? '')).toEqual({ type: 'assign', n: 1 });
	});

	it('drops a binary frame and logs it', async () => {
		const client = await connected();

		client.send(Buffer.from([1, 2, 3]));
		client.send('after');

		await frames.waitForCount(1);
		expect(frames.items).toEqual(['after']);
		expect(log.text()).toContain('dropped a binary frame');
	});

	it('closes the connection on a frame above the daemon limit and never hands it on', async () => {
		const client = await connected();

		client.send('x'.repeat(MAX_FRAME_BYTES + 1));

		await innerClosed.waitForCount(1);
		expect(frames.items).toEqual([]);
		expect(log.text()).toContain('Max payload size exceeded');
	});

	it('reports the end of the inner connection once', async () => {
		const client = await connected();

		client.close();

		await innerClosed.waitForCount(1);
		expect(innerClosed.length).toBe(1);
		expect(bridge.hasInner).toBe(false);
	});

	it('refuses to send when nobody is connected', () => {
		expect(() => bridge.send({ type: 'assign' })).toThrow('No inner worker is connected');
	});
});

describe('HarnessBridge waiting', () => {
	it('times out with the port and what to check', async () => {
		await expect(bridge.waitForInner(30)).rejects.toThrow(`host.docker.internal:${bridge.port}`);
	});

	it('rejects when aborted, and rejects the waiters when the bridge stops', async () => {
		const controller = new AbortController();
		const aborted = bridge.waitForInner(5000, controller.signal);

		controller.abort();

		await expect(aborted).rejects.toThrow('aborted');

		const stopped = bridge.waitForInner(5000);

		await bridge.stop();

		await expect(stopped).rejects.toThrow('stopped');
	});

	it('resolves when the inner worker connects while waiting', async () => {
		const waiting = bridge.waitForInner(3000);

		await connect({ [BRIDGE_TOKEN_HEADER]: TOKEN });

		await expect(waiting).resolves.toBeUndefined();
	});

	it('closeInner ends the connection', async () => {
		const client = await connected();
		const closed = once(client, 'close');

		bridge.closeInner();

		await closed;
		expect(client.readyState).toBe(WebSocket.CLOSED);
	});
});
