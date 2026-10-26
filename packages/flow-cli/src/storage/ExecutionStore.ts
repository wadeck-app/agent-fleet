import { isExecutionId } from 'flow-core';
import type { AttemptEndReason, StepMeta } from 'flow-engine/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionState, StepIoCapture, StepStatus } from '../ipc/Protocol';
import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { AtomicRecordWriter } from './AtomicRecordWriter';
import { AttemptLedger } from './AttemptLedger';
import { ExecutionPruner } from './ExecutionPruner';
import type { ExecutionTransition, ExecutionTransitionListener } from './ExecutionTransition';
import { InterruptedExecutionReconciler } from './InterruptedExecutionReconciler';
import { failRunningSteps } from './RunningStepsFailer';
import { StepIoRecorder } from './StepIoRecorder';
import { startStepEntry } from './StepStartEntry';

function assertExecutionIdSafe(executionId: string): void {
	if (!isExecutionId(executionId)) {
		throw new Error(`Invalid executionId format: ${JSON.stringify(executionId)}`);
	}
}

/** What a step received and produced, as reported with its outcome; recorded capped and masked. */
export interface StepResultIo {
	/** Absent when the worker predates step recording: the outputs are then recorded alone. */
	capture: StepIoCapture | undefined;
	outputs: Record<string, unknown>;
}

/** What the daemon knows about how a failed attempt ended, beyond the message. */
export interface FailedAttemptDetails {
	/** What the worker reported for the attempt. Absent from an older worker or a failure the engine decided itself. */
	meta?: StepMeta;
	/** Set when the daemon failed the step itself (not the step): the attempt is recorded as `engine_failed` with this reason. */
	engineEndReason?: AttemptEndReason;
}

export class ExecutionStore {
	private readonly recorder: StepIoRecorder;
	private readonly atomicWriter = new AtomicRecordWriter();
	/** Steps reopened by `markExecutionResumed` whose next start is a `resume`. Resume only exists within one daemon process. */
	private readonly resumedSteps = new Set<string>();

	constructor(
		private readonly executionsDir: string,
		private readonly retainDays: number = 30,
		// Hides the exact values of the execution's declared secrets in every record written.
		private readonly masks: ExecutionMasks = new ExecutionMasks(),
		// Told once per real transition, with the record as written (masked). The only source of lifecycle events.
		private readonly listener?: ExecutionTransitionListener,
		// Caps and masks what steps received and produced before it is persisted.
		recorder?: StepIoRecorder
	) {
		this.recorder = recorder ?? new StepIoRecorder((executionId, text) => masks.mask(executionId, text));
	}

	/** `activePluginMetaDirs`: `.meta` directories of executions running now, never deleted. */
	pruneOldExecutions(activePluginMetaDirs: () => readonly string[] = () => []): void {
		new ExecutionPruner(this.executionsDir, this.retainDays, activePluginMetaDirs).prune();
	}

	create(params: {
		executionId: string;
		flowFile: string;
		flowId: string;
		stepIds: string[];
		/** Wave (`wave:`) of the sub-steps of a `waves` parent, by step id; every id must be in `stepIds`. */
		stepWaves?: Record<string, number>;
		/** Project this run belongs to, so active projects can be listed (D#10). */
		projectRoot?: string;
		/** Registry id of the project (project-sdk), written next to projectRoot. */
		projectId?: string;
		/** `.meta` of a plugin workspace the daemon created for this run; deleted with the record once it expires. */
		pluginMetaDir?: string;
		/** Which definition ran: version, content hash, snapshot and how the version was chosen. Written once, never changed. */
		definition?: Pick<ExecutionState, 'flowVersion' | 'definitionHash' | 'definitionSnapshot' | 'versionChoice'>;
	}): ExecutionState {
		assertExecutionIdSafe(params.executionId);
		const stepWaves = params.stepWaves ?? {};
		for (const waveStepId of Object.keys(stepWaves)) {
			if (!params.stepIds.includes(waveStepId)) {
				throw new Error(
					`Cannot create execution ${params.executionId}: stepWaves names '${waveStepId}', which is not one of its steps (${params.stepIds.join(', ')})`
				);
			}
		}
		const state: ExecutionState = {
			executionId: params.executionId,
			flowFile: params.flowFile,
			flowId: params.flowId,
			...(params.projectRoot !== undefined ? { projectRoot: params.projectRoot } : {}),
			...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
			...(params.pluginMetaDir !== undefined ? { pluginMetaDir: params.pluginMetaDir } : {}),
			...params.definition,
			status: 'queued',
			currentSteps: [],
			startedAt: new Date().toISOString(),
			completedAt: null,
			steps: Object.fromEntries(
				params.stepIds.map(id => [
					id,
					{
						status: 'pending' as StepStatus,
						...(stepWaves[id] !== undefined ? { wave: stepWaves[id] } : {}),
					},
				])
			),
		};
		this.write(state);
		return state;
	}

	exists(executionId: string): boolean {
		assertExecutionIdSafe(executionId);
		return fs.existsSync(this.filePath(executionId));
	}

	read(executionId: string): ExecutionState {
		assertExecutionIdSafe(executionId);
		const filePath = this.filePath(executionId);
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			return JSON.parse(content) as ExecutionState;
		} catch (err) {
			throw new Error(`Corrupted execution state for ${executionId}: ${String(err)}`);
		}
	}

	update(executionId: string, patch: Partial<ExecutionState>): ExecutionState {
		const current = this.read(executionId);
		const updated = { ...current, ...patch };
		this.write(updated);
		return updated;
	}

	/**
	 * @param provenance - which source and worker took the step (T-06). Recorded at
	 *        dispatch, because that is the only moment the daemon knows both.
	 */
	markStepRunning(
		executionId: string,
		stepId: string,
		provenance?: { sourceId?: string; workerId?: string },
		/** Set when this start re-runs a parent because a sub-step failed; kept in `relaunches`. */
		relaunchFeedback?: string,
		/** What a start after the first is: a `retry`, or a `loop` (the default: any other re-run). Ignored for a first start. */
		reRunKind: 'retry' | 'loop' = 'loop'
	): ExecutionState {
		const state = this.read(executionId);
		const previous = state.steps[stepId];
		const resumed = this.resumedSteps.delete(`${executionId}/${stepId}`);
		state.steps[stepId] = startStepEntry(previous, { resumed, relaunchFeedback, reRunKind, provenance });
		if (!state.currentSteps.includes(stepId)) {
			state.currentSteps.push(stepId);
		}
		const executionStarted = state.status === 'queued';
		if (executionStarted) {
			state.status = 'running';
		}
		const written = this.write(state);
		if (executionStarted) {
			this.notify({ kind: 'execution-started', state: written });
		}
		this.notify({ kind: 'step-started', state: written, stepId });
		return state;
	}

	markStepCompleted(executionId: string, stepId: string, meta?: StepMeta, result?: StepResultIo): ExecutionState {
		const state = this.read(executionId);
		const step = state.steps[stepId];
		// A step that never ran (skipped) is settled quietly: there was no attempt to announce.
		const wasRunning = step?.status === 'running';
		if (step) {
			step.status = 'completed';
			step.completedAt = new Date().toISOString();
			if (meta !== undefined) {
				step.meta = meta;
			}
			if (wasRunning) {
				AttemptLedger.settle(state, stepId, { outcome: 'completed', meta }, step.completedAt);
			}
			this.recordIo(state, stepId, result);
		}
		state.currentSteps = state.currentSteps.filter(id => id !== stepId);
		const written = this.write(state);
		if (wasRunning) {
			this.notify({ kind: 'step-completed', state: written, stepId });
		}
		return state;
	}

	/** Settles a step that will never run (a sub-step it depends on failed); `reason` shows in `flow show`. */
	markStepSkipped(executionId: string, stepId: string, reason: string): ExecutionState {
		const state = this.read(executionId);
		const step = state.steps[stepId];
		if (step) {
			step.status = 'completed';
			step.completedAt = new Date().toISOString();
			step.skippedReason = reason;
		}
		this.write(state);
		return state;
	}

	/**
	 * Resets steps to a clean `pending` state because the scheduler will run them again (a parent
	 * restart resets every sub-step below it). A running step is in flight and reports itself, so it
	 * is left alone. The attempt history (`attempts`, `priorAttemptsMs`, `relaunches`), `injected` and
	 * the provenance are kept.
	 *
	 * @throws Error naming the step when one is not part of the execution (nothing is changed)
	 */
	markStepsPending(executionId: string, stepIds: string[]): ExecutionState {
		const state = this.read(executionId);
		const unknown = stepIds.filter(id => state.steps[id] === undefined);
		if (unknown.length > 0) {
			throw new Error(
				`Cannot reset step(s) ${unknown.map(id => `"${id}"`).join(', ')} to pending: not part of execution ${executionId}.`
			);
		}
		for (const stepId of stepIds) {
			const step = state.steps[stepId]!;
			if (step.status === 'running') {
				continue;
			}
			step.status = 'pending';
			delete step.skippedReason;
			delete step.completedAt;
			delete step.startedAt;
			delete step.error;
			delete step.stdout;
			delete step.stderr;
			delete step.io;
			state.currentSteps = state.currentSteps.filter(id => id !== stepId);
		}
		this.write(state);
		return state;
	}

	markStepFailed(
		executionId: string,
		stepId: string,
		error?: string,
		stdout?: string,
		stderr?: string,
		result?: StepResultIo,
		attempt?: FailedAttemptDetails
	): ExecutionState {
		const state = this.read(executionId);
		const step = state.steps[stepId];
		const alreadyFailed = step?.status === 'failed';
		// Only an attempt in flight is settled here: failing a step that already settled (a parent failed by the
		// engine after its own attempt completed) is not a new attempt
		const wasRunning = step?.status === 'running';
		if (step) {
			step.status = 'failed';
			step.completedAt = new Date().toISOString();
			if (wasRunning) {
				AttemptLedger.settle(
					state,
					stepId,
					{
						outcome: attempt?.engineEndReason === undefined ? 'failed' : 'engine_failed',
						endReason: attempt?.engineEndReason,
						meta: attempt?.meta,
						// Masked BEFORE the entry cuts it: a cut could split a secret so the masker no longer recognises it
						error: error === undefined ? undefined : this.masks.mask(executionId, error),
					},
					step.completedAt
				);
			}
			if (error !== undefined) {
				step.error = error;
			}
			if (stdout !== undefined) {
				step.stdout = stdout;
			}
			if (stderr !== undefined) {
				step.stderr = stderr;
			}
			this.recordIo(state, stepId, result);
		}
		state.currentSteps = state.currentSteps.filter(id => id !== stepId);
		if (error !== undefined) {
			state.lastError = error;
		}
		const written = this.write(state);
		if (step && !alreadyFailed) {
			this.notify({ kind: 'step-failed', state: written, stepId });
		}
		return state;
	}

	markExecutionCompleted(executionId: string): ExecutionState {
		return this.finishExecution(executionId, 'completed');
	}

	markExecutionFailed(executionId: string): ExecutionState {
		return this.finishExecution(executionId, 'failed');
	}

	private finishExecution(executionId: string, status: 'completed' | 'failed'): ExecutionState {
		const current = this.read(executionId);
		const finished: ExecutionState = {
			...current,
			status,
			completedAt: new Date().toISOString(),
			currentSteps: [],
			steps: this.withRunningStepsFailed(
				current,
				current.lastError ?? 'the execution ended while this step was still running'
			),
		};
		const written = this.write(finished);
		if (current.status !== status) {
			this.notify({ kind: status === 'completed' ? 'execution-completed' : 'execution-failed', state: written });
		}
		return finished;
	}

	/** A finished execution has no step in progress: any step still `running` is failed with `error`. */
	private withRunningStepsFailed(state: ExecutionState, error: string): ExecutionState['steps'] {
		return failRunningSteps(state, error, text => this.masks.mask(state.executionId, text));
	}

	/**
	 * Called once when the daemon starts, before it accepts work: fails every record a previous daemon left
	 * `queued`/`running` (see InterruptedExecutionReconciler). Idempotent. Returns how many were reconciled.
	 */
	reconcileInterruptedExecutions(): number {
		return new InterruptedExecutionReconciler(this.executionsDir, {
			read: id => this.read(id),
			write: state => this.write(state),
			notify: transition => this.notify(transition),
			mask: (id, text) => this.masks.mask(id, text),
		}).reconcile();
	}

	/**
	 * Reopens a `failed` execution so `flow history`/`flow show` reflect it as running again,
	 * and resets the resumed step back to `pending` so it is dispatched as a fresh attempt.
	 */
	markExecutionResumed(executionId: string, stepId: string): ExecutionState {
		const state = this.read(executionId);
		state.status = 'running';
		state.completedAt = null;
		const step = state.steps[stepId];
		if (step) {
			step.status = 'pending';
			delete step.completedAt;
			delete step.error;
			this.resumedSteps.add(`${executionId}/${stepId}`);
		}
		this.write(state);
		return state;
	}

	// The execution budget is what the OTHER steps already hold: this step's previous io is being replaced.
	private recordIo(state: ExecutionState, stepId: string, result: StepResultIo | undefined): void {
		const step = state.steps[stepId];
		if (step === undefined || result === undefined) {
			return;
		}
		const usedByOthers = Object.entries(state.steps)
			.filter(([id]) => id !== stepId)
			.reduce((sum, [, other]) => sum + (other.io?.storedChars ?? 0), 0);
		step.io = this.recorder.record({
			executionId: state.executionId,
			capture: result.capture,
			outputs: result.outputs,
			usedByOthers,
		});
	}

	private filePath(executionId: string): string {
		return path.join(this.executionsDir, `${executionId}.json`);
	}

	/** Persists the record with declared secrets masked, and returns what was written. */
	private write(state: ExecutionState): ExecutionState {
		const masked = this.masks.maskDeep(state.executionId, state);
		this.replaceFile(this.filePath(state.executionId), JSON.stringify(masked, null, 2));
		return masked;
	}

	private replaceFile(target: string, content: string): void {
		this.atomicWriter.replaceFile(target, content);
	}

	private notify(transition: ExecutionTransition): void {
		this.listener?.onTransition(transition);
	}
}
