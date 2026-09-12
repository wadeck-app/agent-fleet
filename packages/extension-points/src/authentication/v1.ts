/** What a peer presented when it tried to join. */
export interface AuthenticationRequest {
	/** Credential the peer presented, absent when it presented none. */
	token?: string;
	/** Source the peer claims to belong to, when it names one. */
	sourceId?: string;
	/**
	 * True when the peer's transport is loopback.
	 *
	 * An implementation may accept weaker proof from a loopback peer, since reaching it
	 * already requires local access as the same user. It must never accept a *missing*
	 * credential from a non-loopback peer.
	 */
	loopback: boolean;
}

/**
 * Carries a reason on refusal rather than a bare false: a rejected worker is either a
 * misconfiguration or an intrusion attempt, and both have to be visible in the log.
 */
export type AuthenticationResult = { ok: true } | { ok: false; reason: string };

/**
 * Decides whether a peer may join the daemon (extension point S7).
 *
 * Replaces provenance-based trust. The daemon used to recognise a worker by matching
 * its reported pid against the pids it had spawned, which cannot work for a worker it
 * did not create -- an inbound terminal or another machine has no pid the daemon knows.
 *
 * Implementations must not throw for a bad credential; a refusal is an ordinary outcome
 * and returning a reason lets the caller log it and close the socket.
 */
export interface AuthenticationProvider {
	/**
	 * Synchronous by design in v1: registration is decided inside a WebSocket message
	 * handler, and an awaited check there would leave a socket admitted-but-unverified
	 * for the duration. An implementation needing I/O (a remote key server) belongs in a
	 * v2 of this point, where the registration path can be made async deliberately --
	 * rather than bolting a promise onto a decision that must be immediate.
	 */
	authenticate(request: AuthenticationRequest): AuthenticationResult;
}
