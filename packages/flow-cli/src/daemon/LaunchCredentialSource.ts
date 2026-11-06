import type { WorkerObtainResult, WorkerRequest, WorkerSourceProvider } from 'extension-points';

const REDACTED = '<redacted>';

/**
 * Gives a worker source of a plugin loaded from a directory a launch credential for each worker it is asked for.
 *
 * The daemon mints it (`issue`, a LaunchTokenIssuer) and puts it in `request.authToken`, overwriting anything the request
 * carried; the plugin never receives the minting service itself. The credential is bound to the source, spent on first use
 * and short-lived (see LaunchTokenIssuer). A call that never happens mints nothing. Built-in worker types do not go through
 * this: they get the service through their host and use it as they always did.
 *
 * When the ask FAILS the credential is given back (`revoke`), so a plugin that fails every time cannot fill the cap and have
 * the cap message replace its real error. The error is rethrown as a fresh one with the credential redacted from its
 * message, and without its cause or stack: a plugin that embeds the request in its error would otherwise put the credential
 * in the daemon log and on stderr.
 *
 * Without an issuer the ask fails with a wiring message: handing the plugin a request with no credential would only fail
 * later, at the worker's registration, far from the cause.
 */
export class LaunchCredentialSource implements WorkerSourceProvider {
	constructor(
		private readonly inner: WorkerSourceProvider,
		private readonly issue?: (sourceId: string) => string,
		private readonly revoke?: (sourceId: string, token: string) => void
	) {}

	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- mirrors the contract: sources may resolve with nothing
	async obtainWorker(request: WorkerRequest): Promise<WorkerObtainResult | void> {
		if (this.issue === undefined) {
			throw new Error(
				`worker source "${request.sourceId}" is a plugin loaded from a directory, which gets a launch credential for each worker it is asked for, but the daemon was not wired to mint one. ` +
					'This is a wiring mistake in the daemon, not a configuration error -- please report it.'
			);
		}
		const token = this.issue(request.sourceId);
		let result: WorkerObtainResult | void;
		try {
			result = await this.inner.obtainWorker({ ...request, authToken: token });
		} catch (err) {
			this.revoke?.(request.sourceId, token);
			throw redacted(err, token);
		}
		// Only the exact boolean false gives the credential back; anything else (undefined, true, junk) leaves it for the worker that is starting.
		if (typeof result === 'object' && result !== null && result.launched === false) {
			this.revoke?.(request.sourceId, token);
		}
		return result;
	}
}

/** A fresh error: the original may hold the credential in its message, cause or stack. */
function redacted(err: unknown, token: string): Error {
	const original = err instanceof Error ? err : undefined;
	const error = new Error((original?.message ?? String(err)).split(token).join(REDACTED));
	if (original !== undefined && original.name !== 'Error') {
		error.name = original.name.split(token).join(REDACTED);
	}
	return error;
}
