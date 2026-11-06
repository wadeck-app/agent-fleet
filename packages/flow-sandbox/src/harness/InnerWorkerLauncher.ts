import type { SandboxLog } from '../SandboxLog';
import type { SandboxRuntime } from '../SandboxRuntime';

export interface InnerWorkerExit {
	/** Undefined when the exec itself failed (sbx error, sandbox stopped under it). */
	exitCode: number | undefined;
	/** Why the exec failed, when it did. */
	error?: string;
}

export interface InnerWorkerHandle {
	/** Settles when the process in the VM is gone (never rejects). */
	exited: Promise<InnerWorkerExit>;
	/** Stops waiting for the exec. The process in the VM only dies when the sandbox is stopped. */
	stop(): void;
}

export interface InnerWorkerLaunch {
	sandbox: string;
	/** `FLOW_BRIDGE_URL` and `FLOW_BRIDGE_TOKEN` (the placeholder). */
	env: Readonly<Record<string, string>>;
}

/** Starts the process that runs the flow worker inside a sandbox. A seam so the wrapper is testable without a VM. */
export interface InnerWorkerLauncher {
	launch(request: InnerWorkerLaunch): InnerWorkerHandle;
}

/**
 * `sbx exec` of the harness shim (`node /opt/flow/inner-bridge.cjs`), which starts `/opt/flow/worker.cjs`. The exec
 * stays open for as long as the inner worker lives, which also keeps the VM running; stdout and stderr of the inner
 * worker are written to the wrapper log.
 */
export class SandboxInnerWorkerLauncher implements InnerWorkerLauncher {
	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly log: SandboxLog,
		private readonly shimPath: string = '/opt/flow/inner-bridge.cjs'
	) {}

	launch(request: InnerWorkerLaunch): InnerWorkerHandle {
		const controller = new AbortController();
		const prefix = `[inner ${request.sandbox}]`;
		const writeLines = (level: 'info' | 'warn') => (chunk: string) => {
			for (const line of chunk.split(/\r?\n/)) {
				if (line.trim() !== '') this.log[level](`${prefix} ${line}`);
			}
		};
		const exited = this.runtime
			.exec({
				sandbox: request.sandbox,
				command: ['node', this.shimPath],
				env: request.env,
				signal: controller.signal,
				onStdout: writeLines('info'),
				onStderr: writeLines('warn'),
			})
			.then(
				(result): InnerWorkerExit => ({ exitCode: result.exitCode }),
				(error: unknown): InnerWorkerExit => ({
					exitCode: undefined,
					error: error instanceof Error ? error.message : String(error),
				})
			);
		return { exited, stop: () => controller.abort() };
	}
}
