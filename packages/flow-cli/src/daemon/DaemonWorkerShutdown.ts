import type { DaemonRuntime } from './DaemonRuntime.js';

/**
 * What the daemon does with its workers when it stops, in the order that matters.
 *
 * `run_end(daemon_stopping)` is written FIRST, to the workers of every run in progress, so it is on the wire before
 * the `done` notice and before any socket is closed (a close frame follows data already written). The shutdown hook is
 * synchronous, so the acknowledgement wait is returned for the caller to await (it rides on the flush `stop()` waits
 * for) instead of delaying the closes below: the sockets of workers the daemon did not create are therefore closed right
 * after the notice is written, and for them the wait ends at the close. It is bounded by ONE ack timeout however many
 * runs and workers there are.
 *
 * The worker-type instances of plugin sources are disposed LAST, once the runs were announced and answered: their
 * run hooks (called after the acknowledgements) must still find them. A dispose that fails or hangs is bounded and
 * logged by the instances, never thrown.
 *
 * Safe to call twice (the hook can run twice after the idle path): the coordinator tells each run once, and each
 * instance is disposed once.
 *
 * @returns resolves when the workers answered, left, or the bound expired, and the instances are disposed. Never rejects.
 */
export function shutDownWorkers(
	runtime: Pick<DaemonRuntime, 'commandHandler' | 'workerRegistry' | 'wsServer' | 'workerTypes'>
): Promise<void> {
	const announced = runtime.commandHandler.announceDaemonStop();
	runtime.workerRegistry.broadcastToEphemeral({ type: 'done' });
	runtime.workerRegistry.disconnectExternal();
	runtime.wsServer.close();
	return announced.then(() => runtime.workerTypes.disposeAll());
}

/**
 * What `stop()` must wait for before the process may exit: the queue-event flush and the workers' side of the end of
 * their runs (acknowledgements and workspace releases). Both, so an exit cannot cut either off.
 */
export function awaitShutdownWork(eventsFlushed: Promise<void>, workersAnswered: Promise<void>): Promise<void> {
	return Promise.all([eventsFlushed, workersAnswered]).then(() => undefined);
}
