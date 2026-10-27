/**
 * Resolves 'done' when `wait` settles (resolved or rejected: the caller handles its own errors), 'timeout' after `ms`.
 * The timer is cleared as soon as the race is over, so it never outlives the wait.
 */
export async function raceWithTimeout(wait: Promise<unknown>, ms: number): Promise<'done' | 'timeout'> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<'timeout'>(resolve => {
		timer = setTimeout(() => resolve('timeout'), ms);
	});
	try {
		return await Promise.race([wait.then(() => 'done' as const), timeout]);
	} finally {
		clearTimeout(timer);
	}
}
