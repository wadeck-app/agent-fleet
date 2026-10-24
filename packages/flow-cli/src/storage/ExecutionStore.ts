import { isExecutionId } from 'flow-core';
import type { StepMeta } from 'flow-engine/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionState, StepIoCapture, StepStatus } from '../ipc/Protocol';
import { ExecutionMasks } from '../secrets/ExecutionMasks';
import type { ExecutionTransition, ExecutionTransitionListener } from './ExecutionTransition';
import { StepIoRecorder } from './StepIoRecorder';

function assertExecutionIdSafe(executionId: string): void {
	if (!isExecutionId(executionId)) {
		throw new Error(`Invalid executionId format: ${JSON.stringify(executionId)}`);
	}
}

/** Feedback kept per relaunch in the execution record (truncated). */
const MAX_RELAUNCH_FEEDBACK_CHARS = 2000;

/** What a step received and produced, as reported with its outcome; recorded capped and masked. */
export interface StepResultIo {
	/** Absent when the worker predates step recording: the outputs are then recorded alone. */
	capture: StepIoCapture | undefined;
	outputs: Record<string, unknown>;
}

export class ExecutionStore {
	private readonly recorder: StepIoRecorder;

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

	pruneOldExecutions(): void {
		let rawFiles: string[];
		try {
			rawFiles = fs.readdirSync(this.executionsDir);
		} catch (err) {
			process.stderr.write(`[ExecutionStore] failed to read executions dir for pruning: ${String(err)}\n`);
			return;
		}
		const files = rawFiles.filter(f => f.endsWith('.json'));
		if (files.length === 0) {
			return;
		}
		const cutoffMs = Date.now() - this.retainDays * 24 * 60 * 60 * 1000;
		for (const file of files) {
			const filePath = path.join(this.executionsDir, file);
			try {
				const content = fs.readFileSync(filePath, 'utf8');
				const state = JSON.parse(content) as ExecutionState;
				const timestamp = state.completedAt ?? state.startedAt;
				const ageMs = new Date(timestamp).getTime();
				if (ageMs < cutoffMs) {
					fs.unlinkSync(filePath);
				}
			} catch {
				// fallback: delete if unreadable and old by mtime
				try {
					const stat = fs.statSync(filePath);
					if (stat.mtimeMs < cutoffMs) {
						fs.unlinkSync(filePath);
					}
				} catch {
					/* ignore */
				}
			}
		}
	}

	create(params: {
		executionId: string;
		flowFile: string;
		flowId: string;
		stepIds: string[];
		/** Project this run belongs to, so active projects can be listed (D#10). */
		projectRoot?: string;
		/** Which definition ran: version, content hash, snapshot and how the version was chosen. Written once, never changed. */
		definition?: Pick<ExecutionState, 'flowVersion' | 'definitionHash' | 'definitionSnapshot' | 'versionChoice'>;
	}): ExecutionState {
		assertExecutionIdSafe(params.executionId);
		const state: ExecutionState = {
			executionId: params.executionId,
			flowFile: params.flowFile,
			flowId: params.flowId,
			...(params.projectRoot !== undefined ? { projectRoot: params.projectRoot } : {}),
			...params.definition,
			status: 'queued',
			currentSteps: [],
			startedAt: new Date().toISOString(),
			completedAt: null,
			steps: Object.fromEntries(params.stepIds.map(id => [id, { status: 'pending' as StepStatus }])),
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
		relaunchFeedback?: string
	): ExecutionState {
		const state = this.read(executionId);
		const previous = state.steps[stepId];
		const previousMs =
			previous?.startedAt && previous.completedAt
				? new Date(previous.completedAt).getTime() - new Date(previous.startedAt).getTime()
				: 0;
		// Preserve existing fields (e.g. injected: true) when transitioning to running
		state.steps[stepId] = {
			...previous,
			attempts: (previous?.attempts ?? 0) + 1,
			priorAttemptsMs: (previous?.priorAttemptsMs ?? 0) + previousMs,
			...(relaunchFeedback === undefined
				? {}
				: {
						relaunches: [
							...(previous?.relaunches ?? []),
							{
								at: new Date().toISOString(),
								feedback: relaunchFeedback.slice(0, MAX_RELAUNCH_FEEDBACK_CHARS),
							},
						],
					}),
			status: 'running',
			startedAt: new Date().toISOString(),
			// A new attempt: the previous one's failure must not linger on a step that may now succeed
			error: undefined,
			stdout: undefined,
			stderr: undefined,
			io: undefined,
			completedAt: undefined,
			...(provenance?.sourceId !== undefined ? { sourceId: provenance.sourceId } : {}),
			...(provenance?.workerId !== undefined ? { workerId: provenance.workerId } : {}),
		};
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
			this.recordIo(state, stepId, result);
		}
		state.currentSteps = state.currentSteps.filter(id => id !== stepId);
		const written = this.write(state);
		if (wasRunning) {
			this.notify({ kind: 'step-completed', state: written, stepId });
		}
		return state;
	}

	markStepFailed(
		executionId: string,
		stepId: string,
		error?: string,
		stdout?: string,
		stderr?: string,
		result?: StepResultIo
	): ExecutionState {
		const state = this.read(executionId);
		const step = state.steps[stepId];
		const alreadyFailed = step?.status === 'failed';
		if (step) {
			step.status = 'failed';
			step.completedAt = new Date().toISOString();
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
		};
		const written = this.write(finished);
		if (current.status !== status) {
			this.notify({ kind: status === 'completed' ? 'execution-completed' : 'execution-failed', state: written });
		}
		return finished;
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
		fs.writeFileSync(this.filePath(state.executionId), JSON.stringify(masked, null, 2), 'utf8');
		return masked;
	}

	private notify(transition: ExecutionTransition): void {
		this.listener?.onTransition(transition);
	}
}
