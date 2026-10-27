/** How long an answer is remembered for a repeated request id (milliseconds). */
export const DEFAULT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

/** How many request ids are remembered at most; beyond it the oldest is forgotten. */
export const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 1000;

export interface RunIdempotencyCacheOptions {
	ttlMs?: number;
	maxEntries?: number;
}

interface Entry<T> {
	readonly result: Promise<T>;
	readonly expiresAt: number;
}

/**
 * Remembers, per request id, the promise of the answer to a request, so a client that sends the same request again (its
 * first attempt timed out while the daemon was still working) gets that answer instead of the work being done twice.
 *
 * A resolved answer is kept, refusals included: they are final answers for that request. A rejection (a thrown, internal
 * error) is forgotten at once so that a retry runs the work again. Entries expire after the time to live and the oldest
 * is evicted beyond the cap.
 */
export class RunIdempotencyCache<T> {
	private readonly entries = new Map<string, Entry<T>>();
	private readonly ttlMs: number;
	private readonly maxEntries: number;

	constructor(options: RunIdempotencyCacheOptions = {}) {
		this.ttlMs = options.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
		this.maxEntries = options.maxEntries ?? DEFAULT_IDEMPOTENCY_MAX_ENTRIES;
	}

	get size(): number {
		return this.entries.size;
	}

	/** The answer already (being) computed for `requestId`, or the one `work` starts now. */
	run(requestId: string, work: () => Promise<T>): Promise<T> {
		const now = Date.now();
		const existing = this.entries.get(requestId);
		if (existing !== undefined) {
			if (existing.expiresAt > now) {
				return existing.result;
			}
			this.entries.delete(requestId);
		}
		this.evictExpired(now);

		let result: Promise<T>;
		try {
			result = work();
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
		const entry: Entry<T> = { result, expiresAt: now + this.ttlMs };
		this.entries.set(requestId, entry);
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this.entries.delete(oldest);
		}
		// Only this entry is dropped: the id may already have been re-registered by a later run.
		result.catch(() => {
			if (this.entries.get(requestId) === entry) {
				this.entries.delete(requestId);
			}
		});
		return result;
	}

	/** Forgets everything (the daemon is stopping). */
	clear(): void {
		this.entries.clear();
	}

	private evictExpired(now: number): void {
		for (const [id, entry] of this.entries) {
			if (entry.expiresAt > now) {
				// Insertion order is expiry order: the rest is still valid.
				return;
			}
			this.entries.delete(id);
		}
	}
}
