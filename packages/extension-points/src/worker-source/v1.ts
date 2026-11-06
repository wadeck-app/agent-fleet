/** What a worker needs in order to join a daemon. */
export interface WorkerRequest {
	/** WebSocket endpoint the worker must register with. */
	daemonEndpoint: string;
	/**
	 * Credential the worker must present on registration, verified by the
	 * `authentication` extension point. Never a literal from configuration.
	 *
	 * The daemon mints one per `obtainWorker` call for a source loaded from a plugins
	 * directory: bound to this `sourceId`, spent on first use, valid for 120 s. It is a
	 * credential: **never log the request** (or this field), and pass it to the worker
	 * through its environment, not its command line. If the daemon cannot mint one, the ask fails
	 * with a message instead of reaching the plugin without it.
	 *
	 * Required for any source whose workers are not loopback children of this daemon.
	 * Omitted only when the daemon itself created the worker locally and can therefore
	 * recognise it without one -- consistent with loopback peers needing no transport
	 * credential (D#27). An implementation that reaches off-loopback must treat a
	 * missing token as a hard error rather than connecting without one.
	 */
	authToken?: string;
	/** Id the worker must report, so its steps are attributable to this source. */
	sourceId: string;
	/** Absolute project roots the worker is expected to serve. */
	projects: string[];
}

/**
 * Obtains live workers for one source (extension point S1).
 *
 * The single method covers both families of source, and the engine never learns
 * which it is dealing with: the entry may describe a worker that is *already
 * running* and merely needs contacting, or a *command* that creates one on demand.
 * Contact-or-create is entirely the implementation's business.
 *
 * Deliberately returns no worker object. A live connection is the only proof that a
 * worker is available, and workers always register inbound, so there is nothing
 * meaningful to hand back: the daemon observes the arriving registration and
 * correlates it by `sourceId`. Returning a handle here would invite dispatching to
 * something that has not actually connected.
 */
export interface WorkerSourceProvider {
	/**
	 * Causes one worker to join the daemon.
	 *
	 * Resolves once the worker has been asked to join. Resolution does **not** mean the
	 * worker has registered -- the caller bounds its own wait and treats a worker that
	 * never arrives as absent capacity.
	 *
	 * @throws when the worker cannot be obtained at all, so the caller can report which
	 *         source failed rather than silently seeing no capacity appear.
	 */
	obtainWorker(request: WorkerRequest): Promise<void>;
}
