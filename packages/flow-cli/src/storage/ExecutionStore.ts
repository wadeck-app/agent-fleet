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

/** Marks a file as an unfinished write of a record; must never end in `.json`. */
const TEMP_FILE_INFIX = '.json.tmp-';
/** A leftover temporary file older than this belongs to a writer that died. */
const STALE_TEMP_FILE_MS = 60 * 60 * 1000;
/** Rename errors that mean "locked right now" rather than "cannot work". */
const TRANSIENT_RENAME_CODES = ['EPERM', 'EBUSY', 'EACCES'];
const RENAME_ATTEMPTS = 6;
const RENAME_RETRY_DELAY_MS = 20;
let temporaryFileCounter = 0;

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
		this.removeStaleTemporaryFiles(rawFiles);
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

	/** Deletes unfinished-write files left by a writer that died; a recent one may still be in use. */
	private removeStaleTemporaryFiles(names: string[]): void {
		for (const name of names.filter(n => n.includes(TEMP_FILE_INFIX))) {
			const filePath = path.join(this.executionsDir, name);
			try {
				if (Date.now() - fs.statSync(filePath).mtimeMs > STALE_TEMP_FILE_MS) {
					fs.unlinkSync(filePath);
				}
			} catch (err) {
				process.stderr.write(`[ExecutionStore] could not clean leftover ${filePath}: ${String(err)}\n`);
			}
		}
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
			// A step that now runs is no longer "not run"
			skippedReason: undefined,
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
			steps: this.withRunningStepsFailed(
				current.steps,
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
	private withRunningStepsFailed(steps: ExecutionState['steps'], error: string): ExecutionState['steps'] {
		const completedAt = new Date().toISOString();
		return Object.fromEntries(
			Object.entries(steps).map(([id, step]) => [
				id,
				step.status === 'running'
					? { ...step, status: 'failed' as StepStatus, error: step.error ?? error, completedAt }
					: step,
			])
		);
	}

	/**
	 * Called once when the daemon starts, before it accepts work: all execution state lives in the
	 * daemon's memory, so a record still `queued`/`running` now belongs to a previous daemon and can
	 * never finish. Fails it (running steps failed, pending steps settled as not run) with the reason
	 * and how to re-run, and publishes the usual execution-failed transition. Idempotent.
	 * An unreadable record is reported on stderr and skipped. Returns how many were reconciled.
	 */
	reconcileInterruptedExecutions(): number {
		let names: string[];
		try {
			names = fs.readdirSync(this.executionsDir).filter(name => name.endsWith('.json'));
		} catch (err) {
			process.stderr.write(
				`[ExecutionStore] cannot list ${this.executionsDir} to reconcile interrupted executions: ${String(err)}\n`
			);
			return 0;
		}
		let reconciled = 0;
		for (const name of names) {
			try {
				const current = this.read(path.basename(name, '.json'));
				if (current.status !== 'queued' && current.status !== 'running') {
					continue;
				}
				this.interrupt(current);
				reconciled++;
			} catch (err) {
				process.stderr.write(
					`[ExecutionStore] could not reconcile ${name} (left untouched): ${String(err)}. Inspect or delete ${path.join(this.executionsDir, name)}.\n`
				);
			}
		}
		return reconciled;
	}

	private interrupt(current: ExecutionState): void {
		const reason = `interrupted: the daemon restarted while this execution was running; re-run it with flow run ${current.flowFile}`;
		const completedAt = new Date().toISOString();
		const steps = this.withRunningStepsFailed(current.steps, reason);
		for (const [id, step] of Object.entries(steps)) {
			if (step.status === 'pending') {
				steps[id] = { ...step, status: 'completed', completedAt, skippedReason: `not run (${reason})` };
			}
		}
		const written = this.write({
			...current,
			status: 'failed',
			completedAt,
			currentSteps: [],
			lastError: reason,
			steps,
		});
		this.notify({ kind: 'execution-failed', state: written });
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
		this.replaceFile(this.filePath(state.executionId), JSON.stringify(masked, null, 2));
		return masked;
	}

	/**
	 * Writes `content` to a sibling temporary file and renames it over `target`, so a concurrent
	 * reader (`flow show`, `flow history`, the daemon) sees the old record or the new one, never half.
	 * The temporary name does not end in `.json`, so no `*.json` listing mistakes it for an execution.
	 */
	private replaceFile(target: string, content: string): void {
		const temporary = `${target}${TEMP_FILE_INFIX}${String(process.pid)}-${String(temporaryFileCounter++)}`;
		try {
			fs.writeFileSync(temporary, content, 'utf8');
			this.renameWithRetry(temporary, target);
		} catch (err) {
			try {
				fs.rmSync(temporary, { force: true });
			} catch {
				// Best effort: pruneOldExecutions removes leftovers later
			}
			throw err;
		}
	}

	/**
	 * Windows refuses to rename over a file another process has open (EPERM/EBUSY/EACCES), usually for
	 * a few milliseconds only (a reader, an antivirus scan). Retried a bounded number of times, then
	 * failed with what to do about it. Any other error is not transient and is thrown at once.
	 */
	private renameWithRetry(from: string, to: string): void {
		for (let attempt = 1; ; attempt++) {
			try {
				fs.renameSync(from, to);
				return;
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				if (code === undefined || !TRANSIENT_RENAME_CODES.includes(code)) {
					throw err;
				}
				if (attempt >= RENAME_ATTEMPTS) {
					throw new Error(
						`Cannot save execution ${path.basename(to, '.json')}: ${to} stayed locked (${code}) for ${String(RENAME_ATTEMPTS)} attempts. ` +
							'Another program (editor, antivirus, backup, a second flow process) is holding it open: close it, then re-run. ' +
							'The previous record is untouched.',
						{ cause: err }
					);
				}
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_RETRY_DELAY_MS * attempt);
			}
		}
	}

	private notify(transition: ExecutionTransition): void {
		this.listener?.onTransition(transition);
	}
}
