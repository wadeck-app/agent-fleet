import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';
import { flowEventsStatusLine } from '../events/FlowEventsStatusLine.js';
import type { ExecutionStore } from '../storage/ExecutionStore';
import { writeDaemonLog } from './DaemonLog.js';
import type { RunProject } from './RunProjectResolver.js';
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

	/**
	 * Starts again the runs that were waiting for a workspace when the previous daemon stopped (they were left alone by
	 * the reconcile). Fire-and-forget like the other start-up work: each is either started or waiting again when this
	 * ends, and a failure is logged, never silent.
	 */
	resumeWaitingExecutions(
		executionStore: Pick<ExecutionStore, 'waitingExecutionIdsAtStart'>,
		commandHandler: {
			resumeWaitingExecutions(hooksFor: (project: RunProject) => HookDispatcher | undefined): Promise<void>;
		},
		hooksFor: (project: RunProject) => HookDispatcher | undefined
	): void {
		const waiting = executionStore.waitingExecutionIdsAtStart();
		if (waiting.length === 0) {
			return;
		}
		writeDaemonLog(
			this.logsDir,
			'info',
			`${String(waiting.length)} execution(s) were waiting for a workspace when the previous daemon stopped: starting them again, in arrival order`
		);
		void commandHandler.resumeWaitingExecutions(hooksFor).catch((err: unknown) => {
			writeDaemonLog(
				this.logsDir,
				'error',
				`The daemon could not start the waiting executions again: ${getErrorMessage(err)}. They stay recorded as queued; run them again with flow run.`
			);
		});
	}
}
