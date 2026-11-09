/**
 * The guarantees the sandbox worker type vouches for (the exec variant). The SAME list is declared twice in
 * plugin/plugin.config.js (the manifest, the static upper bound, and the instance, what routing reads); a test keeps the three equal.
 * Advertise only what the exec variant enforces and a measurement or a test backs:
 * - `sandbox`        every step process runs in an sbx VM (SbxProcessLauncher);
 * - `fs=confined`    the VM sees only the run's workspace and `.meta` mounts (RunMounts; plugin README, "Mounts");
 * - `env=clean`      the host environment is not passed into the VM (VmEnvironmentFilter; ExecLiveCheck asserts it);
 * - `ports=private`  the plugin publishes no port and a listener inside the VM was unreachable from the host and other VMs
 *                    (scripts/live/PortsLiveCheck.mjs, one machine);
 * - `clean=run`      a fresh VM per run, removed at the end of the run (the pool slot content is the workspace and persists).
 * - `fs=readonly-enforced` the run workspace is a `:ro` secondary mount, `.meta` the read/write primary (RunMounts; PluginLiveCheck with profile: inspect);
 * Not advertised: `net=filtered` (raw TCP to public destinations is unverified, and an allow-all machine policy would make it
 * false: README "Raw TCP").
 */
export const SANDBOX_GUARANTEES: readonly string[] = [
	'clean=run',
	'env=clean',
	'fs=confined',
	'fs=readonly-enforced',
	'ports=private',
	'sandbox',
];

/**
 * Defence in depth for the routing contract: the daemon sends `requires` (the step's resolved requirements, sorted, absent when
 * empty) in the `assign` message and routes by the guarantees of the worker's authenticated source. A step reaches this worker
 * only because it asked for guarantees it provides, so an assign that carries none, or something this worker does not provide, is
 * a routing bug or an old daemon: the step is refused (fail closed, nothing runs).
 */
/** The guarantee that makes the run's workspace a `:ro` mount (RunMounts `readOnlyWorkspace`). */
export const READ_ONLY_GUARANTEE = 'fs=readonly-enforced';

export class RequiresGuard {
	/** True when the assign's `requires` asks for a read-only workspace. Call after {@link refusal}: a malformed value counts as not asking. */
	static wantsReadOnly(requires: unknown): boolean {
		return Array.isArray(requires) && requires.includes(READ_ONLY_GUARANTEE);
	}

	/** The refusal message, or undefined when the step may run. */
	static refusal(requires: unknown): string | undefined {
		const provided = SANDBOX_GUARANTEES.join(', ');
		if (requires === undefined || requires === null || (Array.isArray(requires) && requires.length === 0)) {
			return (
				`the assignment has no "requires": a step reaches the sandbox worker only when its flow asks for a guarantee this worker provides, ` +
				`so the step was not run. Add "requires: [sandbox]" at the flow or step level. ` +
				`This worker provides: ${provided}.`
			);
		}
		if (!Array.isArray(requires) || requires.some(entry => typeof entry !== 'string' || entry === '')) {
			return (
				`the assignment's "requires" must be a list of strings, got ${JSON.stringify(requires)}, so the step was not run ` +
				`(the daemon and the sandbox plugin may come from incompatible flow-cli versions: update both). This worker provides: ${provided}.`
			);
		}
		const missing = (requires as string[]).filter(entry => !SANDBOX_GUARANTEES.includes(entry));
		if (missing.length === 0) return undefined;
		return (
			`the step requires ${missing.map(entry => JSON.stringify(entry)).join(', ')}, which this worker does not guarantee, so the step was not run ` +
			`(it was routed here by mistake, or the daemon and the plugin disagree). This worker provides: ${provided}. ` +
			`Remove the requirement from the flow, or run the step on a worker that provides it.`
		);
	}
}
