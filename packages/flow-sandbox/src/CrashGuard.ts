import { describeError } from './ErrorText';
import type { SandboxLog } from './SandboxLog';

export interface CrashGuardOptions {
	/** Where the crash events come from: `process`, or an emitter in a test. */
	source: { on(event: string, listener: (value: unknown) => void): unknown };
	/** Releases everything the wrapper holds (CleanupStack). Must never throw. */
	cleanup: { runAll(): Promise<number> };
	log: SandboxLog;
	exit: (code: number) => void;
	/** Upper bound for the cleanup: a hung step must not keep a crashed process (and its open port) alive. Default 15 s. */
	timeoutMs?: number;
}

/**
 * Makes a crash of the wrapper FAIL SAFE. An uncaught exception or unhandled rejection (a bug in a callback, a core
 * bug reachable through a port a process in the VM can talk to) would otherwise end the process with the sandbox
 * running, the credential endpoint's port and the private secrets directory left behind, and the presence file
 * claiming a live wrapper. Here the crash is logged with its stack, the cleanup runs once (bounded in time) and the
 * process exits with a non-zero code.
 */
export class CrashGuard {
	private crashed = false;

	constructor(private readonly options: CrashGuardOptions) {}

	install(): void {
		this.options.source.on('uncaughtException', error => void this.handle('uncaughtException', error));
		this.options.source.on('unhandledRejection', reason => void this.handle('unhandledRejection', reason));
	}

	private async handle(kind: string, value: unknown): Promise<void> {
		if (this.crashed) return;
		this.crashed = true;
		const { log, cleanup, exit } = this.options;
		const timeoutMs = this.options.timeoutMs ?? 15_000;
		log.warn(`fatal ${kind}: ${value instanceof Error ? (value.stack ?? value.message) : describeError(value)}`);
		let timer: NodeJS.Timeout | undefined;
		const outcome = await Promise.race([
			cleanup.runAll().then(failures => ({ failures })),
			new Promise<{ timedOut: true }>(resolve => {
				timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
			}),
		]);
		clearTimeout(timer);
		if ('timedOut' in outcome) {
			log.warn(
				`the cleanup after the crash did not finish within ${timeoutMs} ms: exiting anyway. Check \`leftover list\` for a sandbox left running, and the temp directory for flow-sbx-*-secrets-*.`
			);
		}
		exit(1);
	}
}
