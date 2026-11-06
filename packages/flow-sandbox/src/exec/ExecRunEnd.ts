import { describeError } from '../ErrorText';
import type { SandboxLifecycle } from '../SandboxLifecycle';
import type { SandboxLog } from '../SandboxLog';
import type { JsonObject } from '../harness/HarnessMessages';

const REASONS = new Set(['completed', 'failed', 'daemon_stopping']);

export interface ExecRunEndOptions {
	lifecycle: Pick<SandboxLifecycle, 'current' | 'endRun'>;
	log: SandboxLog;
	/** Sends `run_end_ack` for the run; false when the daemon connection could not take it. */
	sendAck: (executionId: string) => boolean;
	/** Pause before the single retry of a failed removal. The daemon waits 30 s by default for the ack, so keep it short. */
	retryDelayMs: number;
	/** What the wrapper forgets of a run whose sandbox is gone (prepared credentials, mounts). Not called for `daemon_stopping`. */
	afterRemoval: (executionId: string, sandbox: string | undefined) => Promise<void>;
}

/**
 * `run_end` of the daemon: a run this wrapper served is over (flow-cli `RunEndCoordinator`, sent once per run to the
 * workers that declared `run-events` and were handed a step of it). The daemon releases the run's workspace when the
 * ack arrives or its wait (30 s by default, 120 s at most) expires, so the ack is sent only AFTER the sandbox that mounts
 * the workspace is gone.
 *
 * - `completed` / `failed`: the sandbox is REMOVED (SandboxLifecycle.endRun, serialized on the lifecycle queue), then acked.
 *   A failed removal is retried once after a short pause; if it fails again NO ack is sent (the workspace stays held until
 *   the daemon's wait expires, the safe direction) and the log says how to finish by hand.
 * - `daemon_stopping`: the sandbox is STOPPED and kept (the run may resume), then acked.
 * - A run this wrapper holds no sandbox for (its create failed, or it was already removed): nothing to remove, acked at
 *   once, because the daemon counts this worker as served and waits for it. A second `run_end` for the same run therefore
 *   removes nothing again and is acked again; an ack the daemon no longer waits for is only logged and dropped there.
 * - An unknown reason, or a message without a run id: logged, nothing removed, no ack (protocol drift must be visible).
 * - A step of the run still running (a sibling after a terminal failure): the removal does not wait for it. `sbx rm
 *   --force` ends its processes, its exec fails and the daemon drops what it reports after `run_end`.
 */
export class ExecRunEnd {
	constructor(private readonly options: ExecRunEndOptions) {}

	async handle(message: JsonObject): Promise<void> {
		const { lifecycle, log, sendAck } = this.options;
		const executionId = message['executionId'];
		const reason = message['reason'];
		if (
			typeof executionId !== 'string' ||
			executionId === '' ||
			typeof reason !== 'string' ||
			!REASONS.has(reason)
		) {
			log.warn(
				`run_end ignored: ${JSON.stringify(message)} has no run id or an unknown reason "${String(reason)}" (expected completed, failed or daemon_stopping). Nothing was removed and no ack was sent.`
			);
			return;
		}
		const held = lifecycle.current();
		const sandbox = held?.executionId === executionId ? held.name : undefined;
		const end = (): Promise<void> =>
			lifecycle.endRun(executionId, reason as 'completed' | 'failed' | 'daemon_stopping');
		try {
			await end().catch(async (firstError: unknown) => {
				log.warn(
					`run "${executionId}" (${reason}): ending it failed (${describeError(firstError)}); retrying once.`
				);
				await new Promise(resolve => setTimeout(resolve, this.options.retryDelayMs));
				await end();
			});
		} catch (error) {
			const name = sandbox ?? '<sandbox name: see `leftover list`>';
			log.warn(
				`run "${executionId}" (${reason}): sandbox ${name} could not be ${reason === 'daemon_stopping' ? 'stopped' : 'removed'}: ${describeError(error)}. No run_end_ack was sent, so the daemon releases the workspace only when its wait expires. Finish by hand: leftover remove ${name}`
			);
			return;
		}
		if (reason !== 'daemon_stopping') {
			await this.options.afterRemoval(executionId, sandbox).catch((error: unknown) => {
				log.warn(`run "${executionId}": cleanup after the removal failed: ${describeError(error)}`);
			});
		}
		if (!sendAck(executionId)) {
			log.warn(
				`run "${executionId}" (${reason}): done, but the run_end_ack could not be sent (the connection to the daemon is down), so the daemon cannot know.`
			);
		}
	}
}
