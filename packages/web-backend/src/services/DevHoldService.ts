import { randomUUID } from 'node:crypto';

interface HoldEntry {
	id: string;
	pattern: string;
	promise: Promise<void>;
	resolve: () => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * DevHoldService - Enables automated tests to control when the server responds to specific requests
 *
 * This service allows tests to pause incoming requests that match specific patterns,
 * enabling reliable visual screenshots of in-flight loading states.
 *
 * Example flow:
 * 1. Test calls register("PATCH /api/tickets") → server will pause any matching incoming request
 * 2. Test triggers browser action
 * 3. Browser request arrives → preHandler sees match → awaits the release promise
 * 4. Test takes screenshot during loading state
 * 5. Test calls release(id) → server resolves promise → request proceeds
 * 6. Test takes screenshot of final state
 *
 * NOTE: This service should NEVER be active in production (NODE_ENV === 'production')
 */
export class DevHoldService {
	private readonly AUTO_EXPIRE_MS = 30_000;
	private readonly holds = new Map<string, HoldEntry>();

	/**
	 * Register a new hold for requests matching the given pattern
	 * @param pattern - Pattern to match against requests (e.g., "PATCH /api/tickets" or "/api/tickets")
	 * @returns Unique hold ID for later release
	 */
	register(pattern: string): string {
		const id = randomUUID();
		let resolve!: () => void;
		const promise = new Promise<void>(res => {
			resolve = res;
		});
		const timer = setTimeout(() => this.release(id), this.AUTO_EXPIRE_MS);
		this.holds.set(id, { id, pattern, promise, resolve, timer });
		return id;
	}

	/**
	 * Returns the hold promise if the given method+url matches any active hold
	 *
	 * Pattern matching:
	 * - "PATCH /api/tickets" matches "PATCH /api/tickets/abc123"
	 * - "/api/tickets" matches any method on that url prefix
	 *
	 * @param method - HTTP method (GET, POST, etc.)
	 * @param url - Request URL
	 * @returns Promise to await if hold matches, null otherwise
	 */
	getHoldPromise(method: string, url: string): Promise<void> | null {
		const requestLine = `${method.toUpperCase()} ${url}`;
		for (const hold of this.holds.values()) {
			if (requestLine.startsWith(hold.pattern) || url.startsWith(hold.pattern)) {
				return hold.promise;
			}
		}
		return null;
	}

	/**
	 * Release a hold by ID, allowing the request to proceed
	 * @param id - Hold ID to release
	 * @returns true if hold was found and released, false otherwise
	 */
	release(id: string): boolean {
		const hold = this.holds.get(id);
		if (!hold) return false;
		clearTimeout(hold.timer);
		hold.resolve();
		this.holds.delete(id);
		return true;
	}

	/**
	 * Release all active holds
	 */
	releaseAll(): void {
		for (const hold of this.holds.values()) {
			clearTimeout(hold.timer);
			hold.resolve();
		}
		this.holds.clear();
	}

	/**
	 * List all active holds
	 * @returns Array of hold IDs and patterns
	 */
	list(): Array<{ id: string; pattern: string }> {
		return Array.from(this.holds.values()).map(({ id, pattern }) => ({ id, pattern }));
	}
}
