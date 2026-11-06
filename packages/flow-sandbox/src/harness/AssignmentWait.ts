/** What the relay harness waits for during one assignment: the outcome, then the inner worker being free again. */
export interface AssignmentWait {
	terminal: Promise<void>;
	resolveTerminal: () => void;
	free: Promise<void>;
	resolveFree: () => void;
	/** The outcome (or a synthetic failure) already went to the daemon. */
	reported: boolean;
	ids: { assignmentId: string; executionId: string; stepId: string };
	/** Output names the step declares: a too-large result never loses them. */
	declared: ReadonlySet<string>;
}

export function newAssignmentWait(ids: AssignmentWait['ids'], declared: ReadonlySet<string>): AssignmentWait {
	let resolveTerminal = (): void => undefined;
	let resolveFree = (): void => undefined;
	const terminal = new Promise<void>(resolve => (resolveTerminal = resolve));
	const free = new Promise<void>(resolve => (resolveFree = resolve));
	return { terminal, resolveTerminal, free, resolveFree, reported: false, ids, declared };
}

/** Resolves when `promise` does, or after `timeoutMs` (the caller continues; a late value is ignored). */
export function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
	return new Promise<void>(resolve => {
		const timer = setTimeout(resolve, timeoutMs);
		void promise.then(() => {
			clearTimeout(timer);
			resolve();
		});
	});
}
