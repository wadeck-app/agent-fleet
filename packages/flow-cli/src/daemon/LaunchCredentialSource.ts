import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';

/**
 * Gives a worker source of a plugin loaded from a directory a launch credential for each worker it is asked for.
 *
 * The daemon mints it (`issue`, a LaunchTokenIssuer) and puts it in `request.authToken`; the plugin never receives the
 * minting service itself. The credential is bound to the source, spent on first use and short-lived (see
 * LaunchTokenIssuer). A call that never happens mints nothing. Built-in worker types do not go through this: they get the
 * service through their host and use it as they always did.
 */
export class LaunchCredentialSource implements WorkerSourceProvider {
	constructor(
		private readonly inner: WorkerSourceProvider,
		private readonly issue: (sourceId: string) => string
	) {}

	obtainWorker(request: WorkerRequest): Promise<void> {
		return this.inner.obtainWorker({ ...request, authToken: this.issue(request.sourceId) });
	}
}
