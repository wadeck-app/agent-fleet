import type { FailureOrigin } from 'flow-engine';
import type { StepMeta } from 'flow-engine/types';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { DaemonResponse } from '../ipc/Protocol';
import { SecretsResolutionFailedError } from '../secrets/SecretErrors';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';

/**
 * True when a step_failed error is the file-approval timeout's exact sentinel, as opposed to
 * an explicit decision (approved/rejected never throws -- see UserInterventionStepExecutor) or
 * an unrelated provider crash. Matched on this literal phrase rather than the step type alone
 * so a crash that merely happens to be a user_intervention step is still cleaned up normally,
 * not left dangling as "resumable" forever.
 */
function isUnansweredInterventionError(error: string): boolean {
	return error.includes('this step is unanswered, not denied');
}

/** What happens to an execution when a step ends: scheduler progress, failure, resume and cleanup. */
export class StepOutcomes {
	/**
	 * @param tryDispatch Runs a dispatch pass.
	 * @param onExecutionEnded Lets collaborators forget what they kept for an execution that is over.
	 */
	constructor(
		private readonly executions: ExecutionRegistry,
		private readonly queue: ReadyStepQueue,
		private readonly executionStore: ExecutionStore,
		private readonly logWriter: LogWriter,
		private readonly daemonSecrets: DaemonSecrets,
		private readonly workspaces: ExecutionWorkspaces,
		private readonly hooks: ExecutionHooks,
		private readonly tryDispatch: () => void,
		private readonly onExecutionEnded: (executionId: string) => void
	) {}

	/** Called by Daemon when a worker reports step_completed. */
	onStepCompleted(executionId: string, stepId: string, rawOutput: Record<string, unknown>, rawMeta?: StepMeta): void {
		// What later steps, hooks and the scheduler see has the execution's secrets masked.
		const output = this.daemonSecrets.masks.maskDeep(executionId, rawOutput);
		const meta = this.daemonSecrets.masks.maskDeep(executionId, rawMeta);
		const scheduler = this.executions.scheduler(executionId);
		if (!scheduler) {
			process.stderr.write(
				`[CommandHandler] onStepCompleted: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup\n`
			);
			return;
		}

		// Sync output and meta to ExecutionContext (used by worker for template rendering in next step)
		const context = this.executions.context(executionId)!;
		context.stepOutputs[stepId] = output;
		if (meta) {
			context.stepMeta[stepId] = meta;
		}

		// Parent-blocking and deferral logic is handled inside FlowScheduler.complete().
		// It returns [] while children are pending; fires deferred completion when all children settle.
		const newReady = scheduler.complete(stepId, { type: 'completed', outputs: output });
		this.recordSkippedSteps(executionId, scheduler);
		this.recordRequeuedSteps(executionId, scheduler);

		if (scheduler.isTerminal()) {
			// Mark any steps skipped by the scheduler (still 'pending' in store) as completed
			// so the daemon's allDone check can detect execution completion.
			this.markSkippedStepsCompleted(executionId);
			this.cleanupExecution(executionId);
		} else {
			this.queue.enqueueItems(newReady, context);
			// Note: tryDispatch() is called by Daemon after onStepCompleted returns
		}
	}

	/** Called by Daemon when a worker reports step_failed. */
	onStepFailed(executionId: string, stepId: string, rawError: string, rawOutputs?: Record<string, unknown>): void {
		this.settleFailure(executionId, stepId, rawError, 'step', rawOutputs);
	}

	private settleFailure(
		executionId: string,
		stepId: string,
		rawError: string,
		origin: FailureOrigin,
		rawOutputs?: Record<string, unknown>
	): void {
		const error = this.daemonSecrets.masks.mask(executionId, rawError);
		const outputs = this.daemonSecrets.masks.maskDeep(executionId, rawOutputs);
		const scheduler = this.executions.scheduler(executionId);
		if (!scheduler) {
			process.stderr.write(
				`[CommandHandler] onStepFailed: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup\n`
			);
			return;
		}

		const context = this.executions.context(executionId)!;

		// FlowScheduler.complete() handles child-failure propagation internally:
		// - If the failed step is a child and the parent is deferred, the parent is re-queued
		//   (with error recorded in subStepErrors) up to maxSubStepIterations times.
		// - After max iterations the parent is failed terminally, hasFailed() returns true.
		const newReady = scheduler.complete(stepId, { type: 'failed', error, outputs, origin });
		this.recordSkippedSteps(executionId, scheduler);
		this.recordRequeuedSteps(executionId, scheduler);
		this.recordParentFailures(executionId, scheduler);

		if (scheduler.hasFailed()) {
			// Terminal failure - purge queued steps for this execution and cleanup
			this.queue.purge(executionId);
			this.executionStore.markExecutionFailed(executionId);

			const stepType = this.executions.stepType(executionId, stepId);
			if (stepType === 'user_intervention' && isUnansweredInterventionError(error)) {
				// Kept alive on purpose: no other step is touched, so there is nothing to
				// re-validate when this one is answered late (see handleResume).
				this.executions.markResumable(executionId, stepId);
				this.logWriter.writeExecution(
					executionId,
					`Step ${stepId} is an unanswered intervention -- kept resumable via "flow resume ${executionId}" instead of being cleaned up.`,
					'info'
				);
				return;
			}

			this.cleanupExecution(executionId, new Error(error));
		} else {
			// Loop/retry/sub-step-re-run in progress - re-enqueue steps returned by the scheduler
			this.queue.enqueueItems(newReady, context);
			this.tryDispatch();
		}
	}

	/**
	 * Fails a step the daemon itself decided cannot proceed, with the same treatment a
	 * failure reported by a worker gets, except that it is an engine-origin failure: the step's
	 * `retry`, its `onFailure.goto` and the relaunch of its parent do not apply (see
	 * {@link FailureOrigin}), because the step may already have had an effect.
	 *
	 * The store write and the hook are not optional extras: a step left `running` in the
	 * execution store shows up in `flow history` as still running forever, and a hook that
	 * fires for a failing script but not for a lost worker is a gap the author cannot see.
	 */
	failStep(executionId: string, stepId: string, reason: string): void {
		this.executionStore.markStepFailed(executionId, stepId, reason);
		this.logWriter.writeExecution(executionId, `Step ${stepId} failed: ${reason}`, 'error');
		this.settleFailure(executionId, stepId, reason, 'engine');
		this.hooks.dispatch(executionId, 'onStepFailed', { executionId, stepId, error: reason });
	}

	/**
	 * Resumes an execution that was kept alive after a `user_intervention` step timed out
	 * unanswered, re-dispatching exactly that one step.
	 *
	 * No other step is re-run: the scheduler, context, and workspace are exactly as they were
	 * the moment the step timed out, because `onStepFailed` deliberately skipped cleanup for
	 * this case. Only possible while the same daemon process that ran the step is still alive
	 * -- there is no on-disk reconstruction of in-memory execution state (crash recovery is
	 * tracked separately; see the 're-queued' comment on ExecutionStatus in Protocol.ts).
	 */
	handleResume(executionId: string): DaemonResponse {
		const resumable = this.executions.resumable(executionId);
		if (!resumable) {
			if (!this.executionStore.exists(executionId)) {
				return {
					type: 'error',
					code: 'EXECUTION_NOT_FOUND',
					message: `No execution found with id "${executionId}".`,
				};
			}
			return {
				type: 'error',
				code: 'NOT_RESUMABLE',
				message:
					`Execution "${executionId}" is not resumable. Either it did not fail on an unanswered ` +
					'user_intervention step, it was already resumed, or the daemon has restarted since it ' +
					'failed (resume only works while the same daemon process that ran it is still alive).',
			};
		}

		const scheduler = this.executions.scheduler(executionId);
		const context = this.executions.context(executionId);
		if (!scheduler || !context) {
			// Should be unreachable: resumables are only ever set alongside a live
			// scheduler/context, and cleanupExecution is never called while it holds an entry.
			// Fail loudly rather than silently drop the resume if it ever happens.
			this.executions.clearResumable(executionId);
			return {
				type: 'error',
				code: 'NOT_RESUMABLE',
				message: `Execution "${executionId}" lost its in-memory state and cannot be resumed. Re-run the flow instead.`,
			};
		}

		// Secrets are never persisted: the references are resolved again, so a rotated value is used.
		// A reference that no longer resolves leaves the execution resumable, with the reason.
		try {
			this.daemonSecrets.resume(executionId);
		} catch (err) {
			if (!(err instanceof SecretsResolutionFailedError)) {
				throw err;
			}
			return { type: 'error', code: 'SECRET_RESOLUTION_FAILED', message: normalizeError(err).message };
		}

		this.executions.clearResumable(executionId);
		const readyItem = scheduler.resumeFailedStep(resumable.stepId);
		this.executionStore.markExecutionResumed(executionId, resumable.stepId);
		this.logWriter.writeExecution(executionId, `Execution resumed at step ${resumable.stepId}`, 'info');

		this.queue.enqueueItems([readyItem], context);
		this.tryDispatch();

		return { type: 'execution_resumed', executionId, stepId: resumable.stepId };
	}

	/** Records on the parent, with the reason, that it was failed because the engine failed one of its sub-steps. */
	private recordParentFailures(
		executionId: string,
		scheduler: { takeParentFailures(): { stepId: string; message: string }[] }
	): void {
		for (const { stepId, message } of scheduler.takeParentFailures()) {
			this.executionStore.markStepFailed(executionId, stepId, message);
			this.logWriter.writeExecution(executionId, `Step ${stepId} failed: ${message}`, 'error');
		}
	}

	/** Records, with the reason, the sub-steps the scheduler settled without running (their dependency failed). */
	private recordSkippedSteps(
		executionId: string,
		scheduler: { takeSkippedSteps(): { stepId: string; reason: string }[] }
	): void {
		for (const { stepId, reason } of scheduler.takeSkippedSteps()) {
			this.executionStore.markStepSkipped(executionId, stepId, reason);
			this.logWriter.writeExecution(executionId, `Step ${stepId} ${reason}`, 'warning');
		}
	}

	/**
	 * Resets in the store the sub-steps a parent restart sent back to the scheduler's start. Runs AFTER
	 * {@link recordSkippedSteps}: a restart can settle later sub-steps as not run and requeue them in the
	 * same call, so the reset wins and the reason only remains in the execution log line.
	 */
	private recordRequeuedSteps(executionId: string, scheduler: { takeRequeuedSteps(): string[] }): void {
		const requeued = scheduler.takeRequeuedSteps();
		if (requeued.length === 0) {
			return;
		}
		this.executionStore.markStepsPending(executionId, requeued);
		this.logWriter.writeExecution(
			executionId,
			`Sub-steps reset for the next round: ${requeued.join(', ')}`,
			'info'
		);
	}

	private markSkippedStepsCompleted(executionId: string): void {
		if (!this.executionStore.exists(executionId)) {
			return;
		}
		const state = this.executionStore.read(executionId);
		for (const [sid, stepState] of Object.entries(state.steps)) {
			if (stepState.status === 'pending') {
				this.executionStore.markStepCompleted(executionId, sid);
			}
		}
	}

	private cleanupExecution(executionId: string, priorError?: unknown): void {
		this.executions.remove(executionId);
		this.onExecutionEnded(executionId);
		this.workspaces.release(executionId, priorError);
	}
}
