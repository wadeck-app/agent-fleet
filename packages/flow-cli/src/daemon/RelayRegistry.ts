import type { WebSocket } from 'ws';

import type { SourceReady } from '../ipc/Protocol';

/** A relay currently connected and authenticated as a declared source. */
export interface RegisteredRelay {
	ws: WebSocket;
	sourceId: string;
	/** Workers this relay said it is willing to run. The daemon never asks for more (D#19). */
	capacity: number;
}

export type RelayAdmission = { ok: true; relay: RegisteredRelay } | { ok: false; reason: string };

/** The part of the source registry this needs: whether a source credential is valid. */
interface SourceCredentials {
	verifySourceToken(sourceId: string, token: string): boolean;
}

/**
 * The relays currently connected to this daemon.
 *
 * A relay is a process that holds a connection and launches workers locally when asked; it runs
 * no steps itself. It is not a worker, and the two are kept strictly apart: separate credential
 * (T-04, T-11), separate registry, separate protocol. Registering as a source is the more
 * dangerous of the two -- a fake worker absorbs one step, while a fake source manufactures
 * capacity across every project.
 *
 * Like {@link WorkerRegistry} this holds live connections only. A declared source with no
 * connection is simply absent: the registry file records intent, never availability (D#4).
 */
export class RelayRegistry {
	private readonly relays = new Map<string, RegisteredRelay>();

	constructor(private readonly credentials: SourceCredentials) {}

	get liveCount(): number {
		return this.relays.size;
	}

	/**
	 * Admits a relay, or refuses it with a reason.
	 *
	 * The reason is returned rather than thrown because a refusal is an expected outcome on a
	 * network-facing listener; the caller closes the socket and reports it.
	 */
	register(ws: WebSocket, ready: Omit<SourceReady, 'type'> & { type: 'source_ready' }): RelayAdmission {
		const { sourceId, sourceToken, capacity } = ready;

		if (!Number.isInteger(capacity) || capacity < 1) {
			return {
				ok: false,
				reason: `refused relay for source "${sourceId}": capacity must be a positive integer, got ${JSON.stringify(capacity)}. The daemon never asks a relay for more than it declares, so it cannot guess one.`,
			};
		}

		// Covers both "not declared" and "wrong credential", deliberately with one message:
		// distinguishing them would tell an unauthenticated caller which source ids exist.
		if (!this.credentials.verifySourceToken(sourceId, sourceToken)) {
			return {
				ok: false,
				reason: `refused relay for source "${sourceId}": it is not declared, or the source credential did not match. Declare it with "flow worker source add ${sourceId} --provider built-in:relay" and use the source token it prints.`,
			};
		}

		// A reconnecting relay supersedes its earlier connection: the newer socket is the one
		// that can actually be reached, and keeping both would let the daemon address a dead one.
		const relay: RegisteredRelay = { ws, sourceId, capacity };
		this.relays.set(sourceId, relay);
		return { ok: true, relay };
	}

	find(sourceId: string): RegisteredRelay | undefined {
		return this.relays.get(sourceId);
	}

	isRelay(ws: WebSocket): boolean {
		for (const relay of this.relays.values()) {
			if (relay.ws === ws) return true;
		}
		return false;
	}

	/** Drops a relay by connection. Unknown connections are ignored: most are workers. */
	remove(ws: WebSocket): void {
		for (const [sourceId, relay] of this.relays) {
			if (relay.ws === ws) this.relays.delete(sourceId);
		}
	}
}
