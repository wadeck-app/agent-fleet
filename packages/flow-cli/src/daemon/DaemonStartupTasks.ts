import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';
import { flowEventsStatusLine } from '../events/FlowEventsStatusLine.js';
import type { ExecutionStore } from '../storage/ExecutionStore';
import { writeDaemonLog } from './DaemonLog.js';
import { registerAppCoreModules } from './registerAppCoreModules.js';

/** The start-up work that reports to the daemon log and never blocks the first answer. */
export class DaemonStartupTasks {
	constructor(
		private readonly logsDir: string,
		private readonly eventPublisher: FlowEventPublisher
	) {}

	/**
	 * One line, once: whether events will reach the queue, whether the queue documents them, and how to
	 * fix it if not. The events are declared only when the queue is reachable.
	 */
	logEventsStatus(): void {
		void (async () => {
			const status = await this.eventPublisher.status();
			const declaration = status.state === 'enabled' ? await this.eventPublisher.declareEvents() : undefined;
			const line = flowEventsStatusLine(status, declaration);
			writeDaemonLog(this.logsDir, line.level, line.message);
		})();
	}

	/**
	 * Fire-and-forget: app-core being absent or slow (the SDK waits up to 3 s) must not delay or break the
	 * daemon start. Whatever app-core answers lands in the daemon log, `flow logs` shows it.
	 */
	registerWithAppCore(modules: { id: string; manifestPath: string }[] | undefined): void {
		if (modules && modules.length > 0) {
			void registerAppCoreModules(modules, this.logsDir);
		}
	}

	/** Prunes expired records in the background, then marks what a previous daemon left unfinished as failed. */
	pruneAndReconcile(executionStore: ExecutionStore): void {
		// Off the critical path: retention pruning opens every record, which delayed the first answer by seconds.
		// It yields the event loop between chunks and only deletes expired records, so it can run alongside work.
		void executionStore.pruneOldExecutionsInBackground().catch((err: unknown) => {
			writeDaemonLog(this.logsDir, 'error', `[warn] execution pruning failed: ${getErrorMessage(err)}`);
		});
		// Nothing can be live yet: a record still queued/running belongs to a previous daemon.
		const interrupted = executionStore.reconcileInterruptedExecutions();
		writeDaemonLog(
			this.logsDir,
			'info',
			`Reconciled ${String(interrupted)} execution(s) interrupted by a previous daemon stop (marked failed; re-run with flow run)`
		);
	}
}
