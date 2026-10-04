/**
 * Decides whether a worker can run the shell a step's `shell:` field requested.
 *
 * A step that declared no `shell:` field runs anywhere (no constraint), matching the
 * same permissive default as labels (D#22): the field is opt-in, so a step that never
 * asked for a specific interpreter must not become unroutable once workers start
 * declaring capabilities.
 *
 * Shell capability is routing, never authorization (T-07). Satisfying it decides *where*
 * a step runs and grants no privilege.
 *
 * @param stepShellKind - the interpreter declared by the step's `shell:` field, or
 *        undefined when the step did not request one.
 * @param workerCapabilities - shells the worker declared at registration.
 */
export function workerSatisfiesShell(stepShellKind: string | undefined, workerCapabilities: string[]): boolean {
	if (stepShellKind === undefined) return true;
	return workerCapabilities.includes(stepShellKind);
}
