import { setTimeout as delay } from 'node:timers/promises';

export interface PollOptions {
	/** Upper bound on the whole wait. */
	timeoutMs: number;
	/** Pause between two evaluations of the predicate. Defaults to 20 ms. */
	intervalMs?: number;
}

/**
 * Re-evaluates `predicate` until it holds or `timeoutMs` elapses.
 *
 * For conditions only the operating system can signal (a child process exiting, a file appearing
 * because another process wrote it), where there is no event to await. The predicate is checked
 * one last time at the deadline, so a slow event loop cannot turn a satisfied condition into a miss.
 *
 * @returns whether the predicate held before the deadline.
 */
export async function pollUntil(predicate: () => boolean | Promise<boolean>, options: PollOptions): Promise<boolean> {
	const intervalMs = options.intervalMs ?? 20;
	const deadline = Date.now() + options.timeoutMs;
	while (Date.now() < deadline) {
		if (await predicate()) {
			return true;
		}
		await delay(intervalMs);
	}
	return predicate();
}

/** Same as {@link pollUntil}, but fails loudly with `failureMessage` when the condition never holds. */
export async function waitUntil(
	predicate: () => boolean | Promise<boolean>,
	options: PollOptions & { failureMessage: string }
): Promise<void> {
	if (!(await pollUntil(predicate, options))) {
		throw new Error(`${options.failureMessage} (gave up after ${String(options.timeoutMs)}ms)`);
	}
}

/**
 * Lets real time pass so a test can assert that something did NOT happen.
 *
 * Absence has no event to await, so a bounded observation window is the only option. Use it only
 * for that: to wait FOR something, use {@link waitUntil} or an event, which finish as soon as the
 * condition holds instead of always paying the full window.
 */
export async function observeFor(windowMs: number): Promise<void> {
	await delay(windowMs);
}

/**
 * Whether `promise` settles (resolves or rejects) within `ms`. For asserting that something HAPPENS in bounded time
 * (a socket closes, a process exits) without a hand-rolled `Promise.race` + `setTimeout` in every test.
 */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
	const cancel = new AbortController();
	const outcome = await Promise.race([
		promise.then(
			() => true,
			() => true
		),
		delay(ms, false, { signal: cancel.signal }),
	]);
	cancel.abort();
	return outcome;
}

/** Runs `action` once, `ms` from now, to simulate something happening while the code under test is waiting. */
export function runAfter(ms: number, action: () => void): void {
	void delay(ms).then(action);
}
