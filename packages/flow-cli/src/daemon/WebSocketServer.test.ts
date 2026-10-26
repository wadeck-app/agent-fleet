import * as net from 'node:net';
import { networkInterfaces } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';
import { settlesWithin } from '../test-utils/WaitHelpers';
import { type PortBinder, WebSocketServer } from './WebSocketServer.js';

let server: WebSocketServer | undefined;

afterEach(() => {
	server?.close();
	server = undefined;
});

/** A real non-loopback address of this machine, or undefined when there is none. */
function lanAddress(): string | undefined {
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) return address.address;
		}
	}
	return undefined;
}

describe('WebSocketServer - loopback', () => {
	it('serves a plaintext loopback client', async () => {
		const received: unknown[] = [];
		server = new WebSocketServer(
			0,
			(_ws, message) => received.push(message),
			() => {}
		);
		const port = await server.start();

		const client = new WebSocket(`ws://127.0.0.1:${String(port)}`);
		await new Promise<void>((resolve, reject) => {
			client.once('open', () => resolve());
			client.once('error', reject);
		});
		client.send(JSON.stringify({ type: 'ready', pid: 1 }));
		await vi.waitFor(() => expect(received).toHaveLength(1));
		client.close();

		expect(received[0]).toMatchObject({ type: 'ready', pid: 1 });
	});
});

describe('WebSocketServer - reported port', () => {
	// Port 0 means "any free port", which is the only way concurrent daemons avoid colliding.
	// Reporting the requested number instead of the bound one would publish 0 for workers to
	// dial -- the port is published for exactly this purpose, so it has to be the real one.
	it('reports the port the OS actually assigned when asked for any', async () => {
		server = new WebSocketServer(
			0,
			() => {},
			() => {}
		);

		const port = await server.start();

		expect(port).toBeGreaterThan(0);
		expect(server.port).toBe(port);
	});

	it('serves a client on the assigned port', async () => {
		const received: unknown[] = [];
		server = new WebSocketServer(
			0,
			(_ws, message) => received.push(message),
			() => {}
		);
		const port = await server.start();

		const client = new WebSocket(`ws://127.0.0.1:${String(port)}`);
		await new Promise<void>((resolve, reject) => {
			client.once('open', () => resolve());
			client.once('error', reject);
		});
		client.send(JSON.stringify({ type: 'ready', pid: 2 }));
		await vi.waitFor(() => expect(received).toHaveLength(1));
		client.close();
	});
});

describe('WebSocketServer - P-5 enforcement', () => {
	// The listener refuses to exist rather than opening a port that would reject every peer
	// it accepted. This is where P-5 actually bites in v1: a plaintext listener is only ever
	// reachable from this machine, so there is no unencrypted remote connection to make.
	it('refuses to start on a network address without TLS', () => {
		const lan = lanAddress();
		if (lan === undefined) {
			throw new Error('This machine reports no non-loopback IPv4 address, so P-5 cannot be exercised here');
		}

		expect(
			() =>
				new WebSocketServer(
					0,
					() => {},
					() => {},
					{ bindAddress: lan }
				)
		).toThrow(/worker\.tls/);
	});

	it('starts on an explicit loopback address without TLS', async () => {
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ bindAddress: '127.0.0.1' }
		);

		await expect(server.start()).resolves.toBeGreaterThan(0);
	});

	// Binding is not the only guard: the per-connection check stays in place so a future
	// transport that reaches this listener some other way is refused rather than trusted.
	it('closes a connection whose peer is not on this machine and is unencrypted', async () => {
		const closed: string[] = [];
		const write = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
			closed.push(String(chunk));
			return true;
		});
		server = new WebSocketServer(
			0,
			() => {},
			() => {}
		);
		const port = await server.start();

		// Presents itself as a remote plaintext peer, which is what the check reads.
		const internals = server as unknown as { handleConnection: (ws: unknown) => void };
		const fakeSocket = {
			_socket: { remoteAddress: '10.1.2.3', encrypted: false },
			terminate: vi.fn(),
			on: vi.fn(),
		};
		internals.handleConnection(fakeSocket);

		expect(fakeSocket.terminate).toHaveBeenCalled();
		expect(fakeSocket.on).not.toHaveBeenCalled();
		expect(closed.join(' ')).toContain('10.1.2.3');
		write.mockRestore();
		expect(port).toBeGreaterThan(0);
	});
});

describe('WebSocketServer - crowded port range', () => {
	// Orphaned daemons keep their worker listener bound, so the ports just above the requested one can all be taken.
	// Rejecting then left the daemon with no listener: runs queued forever and every forked worker dialed a port
	// nobody served. Any free port serves, because the bound one is published for workers to read.
	/** Fake binder: ports in `refused` fail with the given code, any other (incl. 0) binds for real. */
	function fakeBinder(refused: Map<number, string>, attempts: number[]): PortBinder {
		return (httpServer, port, address) => {
			attempts.push(port);
			const code = refused.get(port);
			if (code === undefined) {
				httpServer.listen(port, address);
				return;
			}
			process.nextTick(() => httpServer.emit('error', Object.assign(new Error(`listen ${code}`), { code })));
		};
	}

	it('binds an OS-assigned port when the requested port and the ten above it are all taken', async () => {
		const requested = 45_400;
		const refused = new Map<number, string>();
		for (let offset = 0; offset <= 10; offset++) refused.set(requested + offset, 'EADDRINUSE');
		const attempts: number[] = [];
		server = new WebSocketServer(
			requested,
			() => {},
			() => {},
			{ bind: fakeBinder(refused, attempts) }
		);

		const bound = await server.start();

		expect(attempts).toEqual([...Array.from({ length: 11 }, (_, offset) => requested + offset), 0]);
		expect(bound).toBeGreaterThan(0);
		expect(server.port).toBe(bound);
	});

	// Windows excluded port ranges (Hyper-V, WinNAT) refuse a bind with EACCES, not EADDRINUSE.
	it('skips a port the OS refuses with EACCES and binds the next one', async () => {
		const requested = 45_420;
		const attempts: number[] = [];
		server = new WebSocketServer(
			requested,
			() => {},
			() => {},
			{ bind: fakeBinder(new Map([[requested, 'EACCES']]), attempts) }
		);

		await server.start();

		expect(attempts.slice(0, 2)).toEqual([requested, requested + 1]);
	});

	it('rejects with the original error when the failure is not about the port being unavailable', async () => {
		server = new WebSocketServer(
			45_430,
			() => {},
			() => {},
			{ bind: fakeBinder(new Map([[45_430, 'EADDRNOTAVAIL']]), []) }
		);

		await expect(server.start()).rejects.toMatchObject({ code: 'EADDRNOTAVAIL' });
	});

	// Real sockets, but no assumption about which ports are free: the occupied ports come from the OS (listen on 0)
	// and the property asserted is only that the bound port is none of them.
	it('with real sockets, never binds a port that is already occupied', async () => {
		const occupants: net.Server[] = [];
		try {
			for (let index = 0; index < 11; index++) {
				const occupant = net.createServer();
				await new Promise<void>((resolve, reject) => {
					occupant.once('error', reject);
					occupant.listen(0, '127.0.0.1', resolve);
				});
				occupants.push(occupant);
			}
			const occupied = occupants.map(occupant => (occupant.address() as net.AddressInfo).port);

			server = new WebSocketServer(
				occupied[0],
				() => {},
				() => {}
			);
			const bound = await server.start();

			expect(occupied).not.toContain(bound);
			expect(server.port).toBe(bound);
		} finally {
			for (const occupant of occupants) occupant.close();
		}
	});
});

describe('WebSocketServer - diagnostics reach the injected log', () => {
	type Entry = { level: string; msg: string };

	async function connect(port: number): Promise<WebSocket> {
		const client = new WebSocket(`ws://127.0.0.1:${String(port)}`);
		await new Promise<void>((resolve, reject) => {
			client.once('open', () => resolve());
			client.once('error', reject);
		});
		return client;
	}

	// A detached daemon has no stderr: a close that is only on stderr is lost.
	it('logs the close code and reason of a connection, and hands them to the close handler', async () => {
		const entries: Entry[] = [];
		const closes: Array<{ code: unknown; reason: unknown }> = [];
		server = new WebSocketServer(
			0,
			() => {},
			(_ws, code, reason) => closes.push({ code, reason }),
			{ log: (level, msg) => entries.push({ level, msg }) }
		);
		const client = await connect(await server.start());

		client.close(4001, 'bye');
		await vi.waitFor(() => expect(closes).toHaveLength(1));

		expect(closes[0]).toEqual({ code: 4001, reason: 'bye' });
		const line = entries.find(e => e.msg.includes('closed'));
		expect(line?.msg).toContain('4001');
		expect(line?.msg).toContain('bye');
	});

	it('logs an abnormal close at error level', async () => {
		const entries: Entry[] = [];
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ log: (level, msg) => entries.push({ level, msg }) }
		);
		const client = await connect(await server.start());

		client.terminate();
		await vi.waitFor(() => expect(entries.some(e => e.msg.includes('closed'))).toBe(true));

		expect(entries.find(e => e.msg.includes('closed'))?.level).toBe('error');
		expect(entries.find(e => e.msg.includes('closed'))?.msg).toContain('1006');
	});

	it('names a frame over the shared limit in the log, with the limit', async () => {
		const entries: Entry[] = [];
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ log: (level, msg) => entries.push({ level, msg }) }
		);
		const client = await connect(await server.start());

		client.send('x'.repeat(MAX_WORKER_FRAME_BYTES + 1));
		await vi.waitFor(() => expect(entries.some(e => e.msg.includes('connection error'))).toBe(true));

		const text = entries.map(e => e.msg).join('\n');
		expect(text).toContain(String(MAX_WORKER_FRAME_BYTES));
	});

	it('logs a connection error through the injected log, not stderr', async () => {
		const entries: Entry[] = [];
		const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ log: (level, msg) => entries.push({ level, msg }) }
		);
		await server.start();
		const handlers = new Map<string, (...args: unknown[]) => void>();
		const fakeWs = {
			_socket: { remoteAddress: '127.0.0.1', encrypted: false },
			terminate: vi.fn(),
			on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler),
		};
		(server as unknown as { handleConnection: (ws: unknown) => void }).handleConnection(fakeWs);

		handlers.get('error')?.(new Error('socket exploded'));

		const stderrText = write.mock.calls.map(c => String(c[0])).join('');
		write.mockRestore();
		expect(entries).toEqual([{ level: 'error', msg: expect.stringContaining('socket exploded') }]);
		expect(stderrText).not.toContain('socket exploded');
		expect(fakeWs.terminate).toHaveBeenCalled();
	});

	it('logs a refused transport through the injected log', async () => {
		const entries: Entry[] = [];
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ log: (level, msg) => entries.push({ level, msg }) }
		);
		await server.start();

		(server as unknown as { handleConnection: (ws: unknown) => void }).handleConnection({
			_socket: { remoteAddress: '10.1.2.3', encrypted: false },
			terminate: vi.fn(),
			on: vi.fn(),
		});

		expect(entries[0]?.level).toBe('error');
		expect(entries[0]?.msg).toContain('10.1.2.3');
	});
});

describe('WebSocketServer - close() leaves nothing that keeps the process alive', () => {
	// An open WebSocket is a referenced handle: a daemon whose command server is already gone but that still has one
	// connected peer is an invisible orphan (no port file, process alive). `ws` does not close existing connections on
	// close(), so a peer that never registered (and so is in no registry) was never closed by anyone.
	it('closes a connected peer that never said anything', async () => {
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ closeGraceMs: 50 }
		);
		const port = await server.start();
		const client = new WebSocket(`ws://127.0.0.1:${String(port)}`);
		await new Promise<void>((resolve, reject) => {
			client.once('open', () => resolve());
			client.once('error', reject);
		});
		const closed = new Promise<void>(resolve => client.once('close', () => resolve()));

		server.close();

		expect(await settlesWithin(closed, 3_000), 'the peer was still connected 3 s after close()').toBe(true);
	});

	it('terminates a peer that ignores the close handshake once the grace has elapsed', async () => {
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ closeGraceMs: 50 }
		);
		const port = await server.start();
		// A raw socket completes the upgrade and then never answers the server's close frame.
		const raw = net.connect(port, '127.0.0.1');
		await new Promise<void>(resolve => raw.once('connect', () => resolve()));
		raw.write(
			'GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'
		);
		await new Promise<void>(resolve => raw.once('data', () => resolve()));
		const ended = new Promise<void>(resolve => raw.once('close', () => resolve()));

		server.close();

		expect(await settlesWithin(ended, 3_000), 'the peer was still connected 3 s after close()').toBe(true);
	});

	// The port scan retries upward on every refusal. A close() that lands between two attempts used to be forgotten by
	// the next one, which bound a listener nobody would ever close.
	it('does not bind a port after close() when the scan was still retrying', async () => {
		const attempts: number[] = [];
		const bind: PortBinder = (httpServer, port, address) => {
			attempts.push(port);
			if (attempts.length === 1) {
				process.nextTick(() =>
					httpServer.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }))
				);
				return;
			}
			httpServer.listen(port, address);
		};
		server = new WebSocketServer(
			45_440,
			() => {},
			() => {},
			{ bind }
		);

		const started = server.start();
		server.close();

		await expect(started).rejects.toThrow(/closed before it finished binding/);
		expect(attempts).toEqual([45_440]);
	});
});
