import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { wssInstances, httpInstances, wssConstructorOptions } = vi.hoisted(() => ({
	wssInstances: [] as Array<EventEmitter & { close: ReturnType<typeof vi.fn> }>,
	httpInstances: [] as Array<{ listen: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>,
	wssConstructorOptions: [] as unknown[],
}));

vi.mock('node:http', () => ({
	createServer: vi.fn(() => {
		const inst = { listen: vi.fn(), close: vi.fn() };
		httpInstances.push(inst);
		return inst;
	}),
}));

vi.mock('ws', async () => {
	const { EventEmitter: EE } = await import('node:events');
	return {
		WebSocketServer: class MockWsServer extends EE {
			close = vi.fn();
			constructor(opts: unknown) {
				super();
				wssConstructorOptions.push(opts);
				wssInstances.push(this as unknown as EventEmitter & { close: ReturnType<typeof vi.fn> });
			}
		},
	};
});

import { WebSocketServer } from './WebSocketServer.js';

function makeMockWs() {
	const ws = new EventEmitter() as EventEmitter & {
		terminate: ReturnType<typeof vi.fn>;
		send: ReturnType<typeof vi.fn>;
		readyState: number;
		OPEN: number;
	};
	ws.terminate = vi.fn();
	ws.send = vi.fn();
	ws.readyState = 1;
	ws.OPEN = 1;
	return ws;
}

describe('WebSocketServer', () => {
	beforeEach(() => {
		wssInstances.length = 0;
		httpInstances.length = 0;
		wssConstructorOptions.length = 0;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('close() closes both the WS server and the HTTP server', () => {
		const server = new WebSocketServer(59100, vi.fn(), vi.fn());
		server.close();

		expect(wssInstances[0]?.close).toHaveBeenCalledOnce();
		expect(httpInstances[0]?.close).toHaveBeenCalledOnce();
	});

	it('a message triggers the onMessage callback with parsed payload', () => {
		const onMessage = vi.fn();
		new WebSocketServer(59101, onMessage, vi.fn());

		const mockWs = makeMockWs();
		wssInstances[0]?.emit('connection', mockWs);

		const payload = { type: 'ready', pid: 42 };
		mockWs.emit('message', Buffer.from(JSON.stringify(payload)));

		expect(onMessage).toHaveBeenCalledOnce();
		expect(onMessage).toHaveBeenCalledWith(mockWs, payload);
	});

	it('a close event on the WS connection triggers the onClose callback', () => {
		const onClose = vi.fn();
		new WebSocketServer(59102, vi.fn(), onClose);

		const mockWs = makeMockWs();
		wssInstances[0]?.emit('connection', mockWs);
		mockWs.emit('close');

		expect(onClose).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledWith(mockWs);
	});

	it('an error on the WS connection calls ws.terminate()', () => {
		new WebSocketServer(59103, vi.fn(), vi.fn());

		const mockWs = makeMockWs();
		wssInstances[0]?.emit('connection', mockWs);
		mockWs.emit('error', new Error('socket hang up'));

		expect(mockWs.terminate).toHaveBeenCalledOnce();
	});

	it('invalid JSON in a message is silently ignored and onMessage is not called', () => {
		const onMessage = vi.fn();
		new WebSocketServer(59104, onMessage, vi.fn());

		const mockWs = makeMockWs();
		wssInstances[0]?.emit('connection', mockWs);
		mockWs.emit('message', Buffer.from('not-valid-json'));

		expect(onMessage).not.toHaveBeenCalled();
	});

	it('sets maxPayload to 1 MiB on the WebSocket server', () => {
		new WebSocketServer(59105, vi.fn(), vi.fn());

		expect(wssConstructorOptions[0]).toMatchObject({ maxPayload: 1024 * 1024 });
	});
});
