import type { LogWriter } from '../storage/LogWriter';
import type { PausedRunSnapshotStore } from '../storage/PausedRunSnapshotStore';
import type { PausedRunSnapshot } from '../storage/PausedRunSnapshotStore';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';

/** What the snapshots are made from, each as the narrowest view of the collaborator that owns it. */
export interface PausedRunSnapshotsParts {
	executions: Pick<
		ExecutionRegistry,
		'scheduler' | 'context' | 'runCommandOf' | 'stepCount' | 'isPaused' | 'isActive'
	>;
	queue: Pick<ReadyStepQueue, 'stepIdsOf'>;
	workspaces: Pick<ExecutionWorkspaces, 'restartInfo'>;
	store: Pick<PausedRunSnapshotStore, 'write' | 'remove'>;
	logWriter: Pick<LogWriter, 'writeExecution'>;
}

export type PersistOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Keeps the restart snapshot of each paused run up to date, so that a daemon restart can restore the run (see
 * `PausedRunRestorer`). A run is snapshotted when it is paused and again after each event that changes what a restore would
 * need (a step ended, a step was injected); a running run is never snapshotted.
 *
 * A run that cannot be persisted (its provider cannot take the workspace back, the state is too large, the disk refuses) is
 * said so, once, in its log: it then ends as failed at a restart, as every run did before.
 */
export class PausedRunSnapshots {
	/** Runs whose last snapshot was written: only those are refreshed (a run that could not be persisted is not retried on every event). */
	private readonly persisted = new Set<string>();

	constructor(private readonly parts: PausedRunSnapshotsParts) {}

	/** Writes the snapshot of a paused run now. */
	persist(executionId: string): PersistOutcome {
		const outcome = this.tryPersist(executionId);
		if (outcome.ok) {
			this.persisted.add(executionId);
		} else {
			this.persisted.delete(executionId);
			this.parts.store.remove(executionId);
		}
		return outcome;
	}

	/** After an event that changes the state of a run: rewrites its snapshot when it is paused and persisted. Loud when that fails. */
	refresh(executionId: string): void {
		if (!this.persisted.has(executionId)) {
			return;
		}
		if (!this.parts.executions.isActive(executionId) || !this.parts.executions.isPaused(executionId)) {
			return;
		}
		const outcome = this.persist(executionId);
		if (!outcome.ok) {
			this.parts.logWriter.writeExecution(
				executionId,
				`This paused execution no longer survives a daemon restart: its restart snapshot could not be updated (${outcome.reason}). It would end as failed at a restart; unpause it, or re-run it later.`,
				'error'
			);
		}
	}

	/** The run left the paused state or ended: its snapshot is not needed any more. */
	remove(executionId: string): void {
		this.persisted.delete(executionId);
		this.parts.store.remove(executionId);
	}

	/** The execution is over: forgets it (its file is deleted with its record). */
	forget(executionId: string): void {
		this.persisted.delete(executionId);
	}

	private tryPersist(executionId: string): PersistOutcome {
		const { executions, queue, workspaces, store } = this.parts;
		const scheduler = executions.scheduler(executionId);
		const context = executions.context(executionId);
		const run = executions.runCommandOf(executionId);
		if (scheduler === undefined || context === undefined || run === undefined) {
			return { ok: false, reason: 'the run is not held by this daemon' };
		}
		const workspace = workspaces.restartInfo(executionId);
		if (workspace === undefined) {
			return { ok: false, reason: 'the run holds no workspace this daemon knows' };
		}
		if (!workspace.adoptable) {
			return { ok: false, reason: workspace.blocker };
		}
		const snapshot: PausedRunSnapshot = {
			run,
			scheduler: scheduler.snapshot(),
			queued: queue.stepIdsOf(executionId),
			context: {
				stepOutputs: context.stepOutputs,
				stepMeta: context.stepMeta,
				...(context.subStepErrors === undefined ? {} : { subStepErrors: context.subStepErrors }),
				...(context.subSteps === undefined ? {} : { subSteps: context.subSteps }),
				...(context.subStepFeedback === undefined ? {} : { subStepFeedback: context.subStepFeedback }),
			},
			stepCount: executions.stepCount(executionId),
			workspace: workspace.handle,
		};
		try {
			store.write(executionId, snapshot);
		} catch (err) {
			return { ok: false, reason: err instanceof Error ? err.message : String(err) };
		}
		return { ok: true };
	}
}
