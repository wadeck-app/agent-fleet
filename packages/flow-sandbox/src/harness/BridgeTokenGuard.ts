import { timingSafeEqual } from 'node:crypto';

/** Name of the request header that carries the token (the only channel the sbx proxy substitutes: gate G1). */
export const BRIDGE_TOKEN_HEADER = 'x-flow-bridge-token';

export type TokenVerdict = { ok: true } | { ok: false; reason: string };

/**
 * The per-sandbox secret the inner worker presents on the WebSocket upgrade. The sandbox holds only a placeholder;
 * the sbx proxy swaps in the real value on its way to the host (verified for headers, NOT for the query string or
 * a WebSocket message: see `scripts/live/BridgeTokenProbe.mjs` and the README).
 *
 * What it is for: only the process the wrapper started inside ITS sandbox can open the bridge, not another process
 * of the host that finds the port. What it is NOT: a barrier against code running in the same VM, which can use
 * the placeholder like the inner worker does (accepted residual, see README).
 */
export class BridgeTokenGuard {
	private expected: Buffer | undefined;

	/** Sets the secret of the sandbox (replacing the previous one). It must be long and random. */
	expect(token: string): void {
		if (token.length < 16) throw new Error('A bridge token must have at least 16 characters.');
		this.expected = Buffer.from(token, 'utf8');
	}

	/** Forgets the secret: every later connection is refused. */
	revoke(): void {
		this.expected = undefined;
	}

	verify(presented: string | string[] | undefined): TokenVerdict {
		if (this.expected === undefined) return { ok: false, reason: 'no bridge token is expected right now' };
		if (presented === undefined) return { ok: false, reason: `no ${BRIDGE_TOKEN_HEADER} header` };
		if (Array.isArray(presented)) return { ok: false, reason: `more than one ${BRIDGE_TOKEN_HEADER} header` };
		if (presented.startsWith('flow-ph-')) {
			return {
				ok: false,
				reason: `the ${BRIDGE_TOKEN_HEADER} value is still a placeholder: the sbx proxy did not substitute it (the custom secret may not be active yet, or the request did not go through the proxy)`,
			};
		}
		const candidate = Buffer.from(presented, 'utf8');
		// Different lengths cannot be compared in constant time; the length of the token is not a secret.
		if (candidate.length !== this.expected.length || !timingSafeEqual(candidate, this.expected)) {
			return { ok: false, reason: `the ${BRIDGE_TOKEN_HEADER} value is wrong` };
		}
		return { ok: true };
	}
}
