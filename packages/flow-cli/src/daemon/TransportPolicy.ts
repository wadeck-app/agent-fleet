import { existsSync, readFileSync } from 'node:fs';

/**
 * Enforces P-5: nothing crossing the LAN is ever in cleartext.
 *
 * A requirement gate, not an extension point (D#29). "No encryption" is not a policy a
 * plugin may choose, so there is deliberately nothing pluggable here -- an implementation
 * that could answer "allow" for an unencrypted remote peer is precisely what P-5 forbids.
 */

/** Addresses that mean "the peer is on this machine". */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface TransportFacts {
	/** Peer address as reported by the socket, or undefined when it cannot be read. */
	remoteAddress?: string;
	/** Whether the connection is encrypted (a TLS socket). */
	encrypted: boolean;
}

export type TransportDecision = { ok: true } | { ok: false; reason: string };

/**
 * Whether a connection may be served at all.
 *
 * Loopback peers are exempt because that is where forked workers and `flow worker` live:
 * requiring certificates for them would mean provisioning TLS to run a flow on one machine,
 * and nothing leaves the host.
 *
 * Everything else must be encrypted, and is **refused** rather than warned about. A stolen
 * credential on this channel does not merely impersonate a worker -- it registers a
 * manufacturer of capacity (T-11) -- and the payloads themselves carry prompts, repo paths
 * and environment (T-12).
 *
 * An unreadable address counts as remote. Failing closed is the only safe direction: the
 * alternative grants loopback exemption to a peer whose origin is unknown.
 */
export function admitTransport({ remoteAddress, encrypted }: TransportFacts): TransportDecision {
	if (remoteAddress !== undefined && remoteAddress !== '' && LOOPBACK_ADDRESSES.has(remoteAddress)) {
		return { ok: true };
	}
	if (encrypted) return { ok: true };

	const who =
		remoteAddress === undefined || remoteAddress === '' ? 'a peer with an unreadable address' : remoteAddress;
	return {
		ok: false,
		reason:
			`refused an unencrypted connection from ${who}: everything exchanged with a non-loopback peer must be encrypted, ` +
			`so this connection was closed rather than accepted with a warning. ` +
			`Configure worker.tls with a certificate and key, or keep the daemon on loopback.`,
	};
}

/**
 * The address the worker listener should bind.
 *
 * Loopback unless the user asked otherwise: becoming network-reachable is a decision to
 * take, never one to inherit from an upgrade.
 *
 * @throws when a wider address is requested with no TLS material. Binding wide without it
 *         would open a port that then refuses every peer it accepts -- a listener that
 *         advertises capacity it cannot serve.
 */
export function resolveBindAddress(configured: string | undefined, options: { hasTls: boolean }): string {
	if (configured === undefined || configured === '') return '127.0.0.1';
	if (LOOPBACK_ADDRESSES.has(configured)) return configured;

	if (!options.hasTls) {
		throw new Error(
			`worker.bindAddress is "${configured}", which is reachable from the network, but worker.tls is not configured. ` +
				`Every non-loopback connection must be encrypted, so this listener would refuse every peer it accepted. ` +
				`Add worker.tls.cert and worker.tls.key, or set worker.bindAddress to 127.0.0.1.`
		);
	}
	return configured;
}

/**
 * Reads a shared secret from an indirection, never from the config text (D#44).
 *
 * `${ENV_VAR}` or `file:<path>` only. A literal is a hard error at load time rather than a
 * warning: a secret written in config is a secret committed to version control, and the
 * project already refuses literal credentials elsewhere.
 */
export function resolveSharedSecret(reference: string): string {
	const trimmed = reference.trim();
	if (trimmed === '') {
		throw new Error(
			'A shared secret was configured as an empty value. Use "${ENV_VAR}" or "file:<path>"; remove the setting entirely if no secret is wanted.'
		);
	}

	const envMatch = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(trimmed);
	if (envMatch) {
		const name = envMatch[1]!;
		const value = process.env[name];
		if (value === undefined || value === '') {
			throw new Error(
				`The shared secret refers to environment variable "${name}", which is not set in the daemon's environment. Set it before starting the daemon.`
			);
		}
		return value;
	}

	if (trimmed.startsWith('file:')) {
		const path = trimmed.slice('file:'.length);
		if (!existsSync(path)) {
			throw new Error(`The shared secret refers to file "${path}", which does not exist.`);
		}
		const value = readFileSync(path, 'utf8').trim();
		if (value === '') throw new Error(`The shared secret file "${path}" is empty.`);
		return value;
	}

	throw new Error(
		'A shared secret must not be written literally in configuration. Use "${ENV_VAR}" to read it from the environment, or "file:<path>" to read it from a file.'
	);
}
