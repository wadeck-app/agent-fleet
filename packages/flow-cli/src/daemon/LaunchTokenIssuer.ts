import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * How long a launch token stays valid. Long enough for a worker process to start and register,
 * short enough that a token left in a process environment is not a standing credential.
 */
export const DEFAULT_LAUNCH_TOKEN_TTL_MS = 120_000;

/**
 * How many credentials of one source may be outstanding (minted, not yet spent, not yet expired) at once. Every ask for a
 * worker mints one, so a source whose workers never register would otherwise pile them up; 32 is far above any honest burst
 * of parallel steps asking for workers within the 120 s a credential lives, and small enough to bound the memory and the
 * number of valid secrets.
 */
export const MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE = 32;

interface OutstandingToken {
	sourceId: string;
	token: string;
	expiresAt: number;
}

/**
 * Mints the one-shot credential a worker the daemon launched uses to register.
 *
 * Why this exists: the registry stores only hashes (T-09), so the daemon cannot hand out a
 * source's registration token, and a `built-in:command` entry cannot carry one either -- the token
 * does not exist yet when the source is declared, and writing it into `worker-sources.json` later
 * would put in the file exactly what T-09 keeps out of it.
 *
 * So the daemon mints a credential at the moment it launches a worker and passes it in that child's
 * environment. Nothing is persisted, it is accepted once, and it expires -- a copy stolen from a
 * process listing is worthless a minute later, and worthless immediately if the worker already used
 * it.
 */
export class LaunchTokenIssuer {
	private readonly outstanding: OutstandingToken[] = [];

	constructor(
		private readonly ttlMs: number = DEFAULT_LAUNCH_TOKEN_TTL_MS,
		private readonly now: () => number = Date.now
	) {}

	/**
	 * Mints a token for one launch of `sourceId`.
	 *
	 * @throws when the source already has {@link MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE} outstanding; the message never
	 *         carries a token
	 */
	issue(sourceId: string): string {
		this.prune();
		if (
			this.outstanding.filter(candidate => candidate.sourceId === sourceId).length >=
			MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE
		) {
			throw new Error(
				`source "${sourceId}" already has ${String(MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE)} launch credentials outstanding (each is spent when its worker registers and expires after ${String(Math.round(this.ttlMs / 1000))} s), so no new one is minted. ` +
					'A credential is issued per ask, each lasting ' +
					`${String(Math.round(this.ttlMs / 1000))} s, so a source that is asked repeatedly while it starts no worker (for example because its worker is already running) fills the cap: such a source should return { launched: false } from obtainWorker to give the credential back. ` +
					"If it did launch workers, they are not registering: check the source's launch and its logs, or wait for the credentials to expire."
			);
		}
		const token = randomBytes(32).toString('hex');
		this.outstanding.push({ sourceId, token, expiresAt: this.now() + this.ttlMs });
		return token;
	}

	/**
	 * Gives a credential back because its launch failed, so it neither waits out its lifetime nor counts against the cap.
	 * Idempotent: an unknown, spent or expired token is a no-op, and a token of another source is not touched.
	 */
	revoke(sourceId: string, token: string): void {
		const index = this.outstanding.findIndex(
			candidate => candidate.sourceId === sourceId && sameSecret(candidate.token, token)
		);
		if (index !== -1) this.outstanding.splice(index, 1);
	}

	/**
	 * Spends a token, returning whether it was valid for that source.
	 *
	 * A wrong source does not spend the token: refusing a replay elsewhere must not cost the worker
	 * it was minted for its one chance to register.
	 */
	consume(sourceId: string, token: string): boolean {
		this.prune();
		if (token === '') return false;

		const index = this.outstanding.findIndex(
			candidate => candidate.sourceId === sourceId && sameSecret(candidate.token, token)
		);
		if (index === -1) return false;

		this.outstanding.splice(index, 1);
		return true;
	}

	private prune(): void {
		const now = this.now();
		for (let index = this.outstanding.length - 1; index >= 0; index--) {
			if (this.outstanding[index]!.expiresAt <= now) this.outstanding.splice(index, 1);
		}
	}
}

/** Constant-time comparison, so a rejected token leaks nothing about the expected one. */
function sameSecret(expected: string, presented: string): boolean {
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(presented, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
