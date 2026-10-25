/** The subset of `process` the handlers listen on; lets a test drive them without killing the runner. */
export interface CrashSignalSource {
	on(event: string, listener: (...args: any[]) => void): unknown;
}

function describeReason(reason: unknown): string {
	return reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
}

/**
 * Makes every way a worker can die leave a line on stderr first.
 *
 * The daemon is detached with its own stdio ignored; the only trace of a dead worker is the tail of
 * its stderr that `ForkWorkerSource` copies to the daemon log. A crash that prints nothing leaves
 * the daemon with a bare "disconnected".
 */
export function installWorkerCrashHandlers(
	source: CrashSignalSource,
	writeStderr: (text: string) => void,
	exit: (code: number) => void
): void {
	source.on('uncaughtException', (err: unknown) => {
		writeStderr(`[worker] fatal: uncaughtException: ${describeReason(err)}\n`);
		exit(1);
	});
	source.on('unhandledRejection', (reason: unknown) => {
		writeStderr(`[worker] fatal: unhandledRejection: ${describeReason(reason)}\n`);
		exit(1);
	});
	// 128 + signal number, the shell convention, so the daemon log tells a kill from a crash.
	source.on('SIGTERM', () => {
		writeStderr('[worker] received SIGTERM, exiting\n');
		exit(143);
	});
	source.on('SIGINT', () => {
		writeStderr('[worker] received SIGINT, exiting\n');
		exit(130);
	});
}
