/**
 * Resolves the path to *this* CLI's own .cjs bundle.
 *
 * Every CLI built from `ci/templates/bin-launcher.js.tmpl` exports the same, non-namespaced
 * `LAUNCHER_BUNDLE_OVERRIDE` variable into its process environment. A CLI spawned from another
 * CLI's process tree therefore inherits a path to a *foreign* bundle -- e.g. a `flow run` started
 * by a queue subscriber saw `queue.cjs` and launched that as the flow daemon, which never wrote a
 * port file, so `flow run` died with "Daemon did not start within 10000ms".
 *
 * The override is only honoured when it actually names this CLI's bundle; anything else is
 * reported on stderr and ignored rather than silently followed.
 *
 * @param expectedBundleName basename this CLI's bundle must have, e.g. `flow.cjs`
 * @param selfPath path to use when there is no usable override (normally the running file)
 */
export function resolveOwnBundlePath(expectedBundleName: string, selfPath: string): string {
	const override = process.env['LAUNCHER_BUNDLE_OVERRIDE'];
	if (override === undefined || override === '') return selfPath;

	// The launcher may emit either separator, and Windows paths are case-insensitive.
	const overrideName = override.split(/[\\/]/).pop() ?? '';
	if (overrideName.toLowerCase() === expectedBundleName.toLowerCase()) return override;

	console.warn(
		`[warn] Ignoring LAUNCHER_BUNDLE_OVERRIDE="${override}": it names "${overrideName}", ` +
			`not this CLI's bundle "${expectedBundleName}". ` +
			`That variable is shared by every CLI launcher, so it leaks into child processes -- ` +
			`this value most likely comes from the parent process that spawned this command. ` +
			`Using "${selfPath}" instead.`
	);
	return selfPath;
}
