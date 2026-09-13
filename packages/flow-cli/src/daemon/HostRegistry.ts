import type { WebSocket } from 'ws';

import type { SourceReady } from '../ipc/Protocol';

/** A host currently connected and authenticated as a declared source. */
export interface RegisteredHost {
	ws: WebSocket;
	sourceId: string;
	/** Workers this host said it is willing to run. The daemon never asks for more (D#19). */
	capacity: number;
}

export type HostAdmission = { ok: true; host: RegisteredHost } | { ok: false; reason: string };

/** The part of the source registry this needs: whether a source credential is valid. */
interface SourceCredentials {
	verifySourceToken(sourceId: string, token: string): boolean;
}

/**
 * The hosts currently connected to this daemon.
 *
 * A host is a machine that can produce workers, not a worker itself, and the two are kept
 * strictly apart: separate credential (T-04, T-11), separate registry, separate protocol.
 * Registering as a source is the more dangerous of the two -- a fake worker absorbs one
 * step, while a fake source manufactures capacity across every project.
 *
 * Like {@link WorkerRegistry} this holds live connections only. A declared source with no
 * connection is simply absent: the registry file records intent, never availability (D#4).
 */
export class HostRegistry {
	private readonly hosts = new Map<string, RegisteredHost>();

	constructor(private readonly credentials: SourceCredentials) {}

	get liveCount(): number {
		return this.hosts.size;
	}

	/**
	 * Admits a host, or refuses it with a reason.
	 *
	 * The reason is returned rather than thrown because a refusal is an expected outcome on a
	 * network-facing listener; the caller closes the socket and reports it.
	 */
	register(ws: WebSocket, ready: Omit<SourceReady, 'type'> & { type: 'source_ready' }): HostAdmission {
		const { sourceId, sourceToken, capacity } = ready;

		if (!Number.isInteger(capacity) || capacity < 1) {
			return {
				ok: false,
				reason: `refused host for source "${sourceId}": capacity must be a positive integer, got ${JSON.stringify(capacity)}. The daemon never asks a host for more than it declares, so it cannot guess one.`,
			};
		}

		// Covers both "not declared" and "wrong credential", deliberately with one message:
		// distinguishing them would tell an unauthenticated caller which source ids exist.
		if (!this.credentials.verifySourceToken(sourceId, sourceToken)) {
			return {
				ok: false,
				reason: `refused host for source "${sourceId}": it is not declared, or the source credential did not match. Declare it with "flow worker source add ${sourceId} --provider built-in:host" and use the source token it prints.`,
			};
		}

		// A reconnecting host supersedes its earlier connection: the newer socket is the one
		// that can actually be reached, and keeping both would let the daemon address a dead one.
		const host: RegisteredHost = { ws, sourceId, capacity };
		this.hosts.set(sourceId, host);
		return { ok: true, host };
	}

	find(sourceId: string): RegisteredHost | undefined {
		return this.hosts.get(sourceId);
	}

	isHost(ws: WebSocket): boolean {
		for (const host of this.hosts.values()) {
			if (host.ws === ws) return true;
		}
		return false;
	}

	/** Drops a host by connection. Unknown connections are ignored: most are workers. */
	remove(ws: WebSocket): void {
		for (const [sourceId, host] of this.hosts) {
			if (host.ws === ws) this.hosts.delete(sourceId);
		}
	}
}
