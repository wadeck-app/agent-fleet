import type { AuthenticationProvider, AuthenticationRequest, AuthenticationResult } from 'extension-points';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

/**
 * Built-in `authentication` implementation: a shared token (D#21, D#27).
 *
 * Two credentials, deliberately not interchangeable:
 *
 * - a peer naming a `sourceId` is checked against that source's registration token, so
 *   one source's token cannot be replayed as another's
 * - a loopback peer naming no source is checked against the daemon's own `health_token`,
 *   the credential the CLI already uses over loopback
 *
 * The daemon token is refused off-loopback: it exists for local CLI calls, and a remote
 * peer must present a source token that can be revoked independently.
 *
 * **Mitigates T-01 across users only.** Both credentials are files readable by the
 * owning user, so any process running as that user can read them and impersonate a
 * worker. That residual risk is accepted and documented, not closed here.
 */
export class SharedTokenAuthenticator implements AuthenticationProvider {
	constructor(
		private readonly daemonDir: string,
		private readonly sources: WorkerSourceRegistry,
		/**
		 * Credentials minted for workers this daemon launched itself.
		 *
		 * Optional: without it, only what the registry can verify is admitted. A worker the daemon
		 * started cannot present the source's registration token -- only its hash is stored (T-09) --
		 * so it presents a one-shot token instead, valid once and briefly.
		 */
		private readonly launchTokens?: { consume(sourceId: string, token: string): boolean }
	) {}

	authenticate(request: AuthenticationRequest): AuthenticationResult {
		if (request.token === undefined || request.token === '') {
			return {
				ok: false,
				reason: request.sourceId
					? `worker for source "${request.sourceId}" presented no credential; pass the registration token printed by "flow worker source add"`
					: 'worker presented no credential',
			};
		}

		if (request.sourceId !== undefined && request.sourceId !== '') {
			// Declared token first: it is what a worker started by hand presents, and checking it
			// first means a launch token is only ever spent by the launch it was minted for.
			if (!this.sources.verifyToken(request.sourceId, request.token)) {
				if (this.launchTokens?.consume(request.sourceId, request.token) === true) {
					return { ok: true };
				}
				return {
					ok: false,
					reason: `credential rejected for source "${request.sourceId}": it does not match that source's registration token, or the source is not declared`,
				};
			}
			return { ok: true };
		}

		// No source named: only a loopback peer can use the daemon's own token.
		if (!request.loopback) {
			return {
				ok: false,
				reason: "a non-loopback worker must name the source it belongs to and present that source's registration token; the daemon token is only accepted over loopback",
			};
		}

		let expected: string;
		try {
			expected = readFileSync(join(this.daemonDir, 'health_token'), 'utf8').trim();
		} catch (err) {
			// Fails closed: treating an unreadable token as "no check required" would
			// admit every peer, which is the opposite of what this class is for.
			return {
				ok: false,
				reason: `cannot read health_token in "${this.daemonDir}", so no worker can be authenticated: ${String(err)}`,
			};
		}

		if (!constantTimeEquals(request.token, expected)) {
			return { ok: false, reason: 'worker presented a token that does not match the daemon token' };
		}
		return { ok: true };
	}
}

/** Compared in constant time so a token cannot be recovered byte by byte from timing. */
function constantTimeEquals(a: string, b: string): boolean {
	const left = Buffer.from(a, 'utf8');
	const right = Buffer.from(b, 'utf8');
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}
