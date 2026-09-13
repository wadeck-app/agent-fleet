/**
 * P-5 over a real encrypted socket.
 *
 * The unit tests decide the policy; this proves the listener actually speaks TLS and that the
 * per-connection guard admits an encrypted peer that is **not** on this machine's loopback --
 * the one branch nothing could reach before, because a plaintext listener is refused off
 * loopback by construction.
 *
 * The certificate is generated at test time with openssl rather than committed: a private key
 * in the repository is a private key in the repository, self-signed or not.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { WebSocketServer } from '../daemon/WebSocketServer';

let dir: string;
let server: WebSocketServer | undefined;
let client: WebSocket | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'flow-tls-'));
});

afterEach(() => {
	client?.close();
	client = undefined;
	server?.close();
	server = undefined;
	rmSync(dir, { recursive: true, force: true });
});

/**
 * Generates a self-signed certificate for localhost.
 *
 * Fails rather than skipping when openssl is unavailable: a test that quietly does nothing
 * reports success for encryption it never established, which is the failure mode this whole
 * file exists to rule out.
 */
function generateCertificate(): { cert: string; key: string } {
	const cert = join(dir, 'cert.pem');
	const key = join(dir, 'key.pem');
	const result = spawnSync(
		'openssl',
		[
			'req',
			'-x509',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-keyout',
			key,
			'-out',
			cert,
			'-days',
			'1',
			'-subj',
			'/CN=localhost',
		],
		{ encoding: 'utf8', timeout: 60_000 }
	);

	if (result.error !== undefined || !existsSync(cert) || !existsSync(key)) {
		throw new Error(
			`openssl could not generate a test certificate, so encrypted transport cannot be exercised: ${result.error?.message ?? result.stderr ?? 'unknown failure'}`
		);
	}
	return { cert, key };
}

/** A real non-loopback address of this machine, or undefined when there is none. */
function lanAddress(): string | undefined {
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) return address.address;
		}
	}
	return undefined;
}

async function openSocket(url: string): Promise<WebSocket> {
	// The certificate is self-signed, so the client is told not to verify the chain. That is a
	// statement about this test's trust in its own certificate, not about the encryption:
	// the bytes on the wire are encrypted either way, which is what P-5 requires.
	const socket = new WebSocket(url, { rejectUnauthorized: false });
	client = socket;
	await new Promise<void>((resolve, reject) => {
		socket.once('open', () => resolve());
		socket.once('error', reject);
	});
	return socket;
}

describe('the worker listener with TLS configured', () => {
	it('accepts an encrypted connection and reads messages from it', async () => {
		const received: unknown[] = [];
		server = new WebSocketServer(
			0,
			(_ws, message) => received.push(message),
			() => {},
			{ tls: generateCertificate() }
		);
		const port = await server.start();

		const socket = await openSocket(`wss://127.0.0.1:${String(port)}`);
		socket.send(JSON.stringify({ type: 'ready', pid: 4242 }));
		await vi.waitFor(() => expect(received).toHaveLength(1));

		expect(received[0]).toMatchObject({ type: 'ready', pid: 4242 });
	});

	// If the listener were still plaintext, a `ws://` client would connect happily. It must not.
	it('refuses a plaintext client on the same port', async () => {
		server = new WebSocketServer(
			0,
			() => {},
			() => {},
			{ tls: generateCertificate() }
		);
		const port = await server.start();

		await expect(openSocket(`ws://127.0.0.1:${String(port)}`)).rejects.toThrow();
	});

	// The branch that could not be reached before: off loopback *and* encrypted, which P-5
	// admits. Reaching it needs a listener that is both non-loopback and TLS, which is exactly
	// the configuration the bind guard requires.
	it('admits an encrypted peer that is not on loopback', async () => {
		const lan = lanAddress();
		if (lan === undefined) {
			throw new Error('This machine reports no non-loopback IPv4 address, so P-5 cannot be exercised here');
		}

		const received: unknown[] = [];
		server = new WebSocketServer(
			0,
			(_ws, message) => received.push(message),
			() => {},
			{ bindAddress: lan, tls: generateCertificate() }
		);
		const port = await server.start();

		const socket = await openSocket(`wss://${lan}:${String(port)}`);
		socket.send(JSON.stringify({ type: 'ready', pid: 4343 }));
		await vi.waitFor(() => expect(received).toHaveLength(1));

		expect(received[0]).toMatchObject({ type: 'ready', pid: 4343 });
	});

	it('reports a certificate path that does not exist rather than starting unencrypted', () => {
		expect(
			() =>
				new WebSocketServer(
					0,
					() => {},
					() => {},
					{ tls: { cert: join(dir, 'missing-cert.pem'), key: join(dir, 'missing-key.pem') } }
				)
		).toThrow();
	});
});
