import { networkInterfaces } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { WebSocketServer } from './WebSocketServer.js';

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
			45_301,
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
					45_302,
					() => {},
					() => {},
					{ bindAddress: lan }
				)
		).toThrow(/worker\.tls/);
	});

	it('starts on an explicit loopback address without TLS', async () => {
		server = new WebSocketServer(
			45_303,
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
			45_304,
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
