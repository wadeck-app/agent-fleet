import type { AttemptRecord, ExecutionState, StepState } from 'flow-core';
import type { AttemptEndReason, ModelStepMeta, StepMeta } from 'flow-engine/types';

/** Entries kept per step; the oldest fold into `attemptOverflow` past it. */
export const MAX_ATTEMPTS_PER_STEP = 50;
/** Entries kept per execution, over all its steps. */
export const MAX_ATTEMPTS_PER_EXECUTION = 400;
/** Characters of a failure message kept in an entry. */
export const MAX_ATTEMPT_ERROR_CHARS = 500;

/** How an attempt ended, as far as the code settling it knows. */
export interface AttemptSettlement {
	outcome: AttemptRecord['outcome'];
	/** Used when the meta (or its absence) does not say why. */
	endReason?: AttemptEndReason;
	/** What the worker reported for this attempt; absent when none arrived (older worker, engine failure). */
	meta?: StepMeta;
	error?: string;
}

function isModelMeta(meta: StepMeta | undefined): meta is ModelStepMeta {
	return meta !== undefined && 'cost' in meta && typeof (meta as ModelStepMeta).cost === 'object';
}

/**
 * Writes the history of a step's attempts into the execution record, one entry per attempt, when the attempt settles.
 *
 * Stateless: takes the record, changes it in place, and applies the size caps. It never invents a figure: whatever
 * the meta did not report stays absent, above all `usd`.
 */
export class AttemptLedger {
	/** Appends the entry of the attempt now settling and clears the step's `runningAttempt`. */
	static settle(state: ExecutionState, stepId: string, settlement: AttemptSettlement, endedAt: string): void {
		const step = state.steps[stepId];
		if (step === undefined) {
			return;
		}
		const entry = AttemptLedger.build(step, settlement, endedAt);
		step.attemptLog = [...(step.attemptLog ?? []), entry];
		delete step.runningAttempt;
		AttemptLedger.foldStep(step);
		AttemptLedger.foldExecution(state);
	}

	private static build(step: StepState, settlement: AttemptSettlement, endedAt: string): AttemptRecord {
		const n = step.attempts ?? 1;
		const startedAt = step.startedAt ?? endedAt;
		const meta = settlement.meta;
		const entry: AttemptRecord = {
			n,
			origin: step.runningAttempt?.origin ?? (n <= 1 ? 'first' : 'loop'),
			startedAt,
			endedAt,
			durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
			outcome: settlement.outcome,
			endReason: AttemptLedger.endReason(settlement),
		};
		if (step.runningAttempt?.relaunchIndex !== undefined) {
			entry.relaunchIndex = step.runningAttempt.relaunchIndex;
		}
		if (settlement.error !== undefined) {
			entry.error = settlement.error.slice(0, MAX_ATTEMPT_ERROR_CHARS);
		}
		if (isModelMeta(meta)) {
			AttemptLedger.addModelFigures(entry, meta);
		}
		return entry;
	}

	private static endReason(settlement: AttemptSettlement): AttemptEndReason {
		const fromMeta = (settlement.meta as { end_reason?: AttemptEndReason } | undefined)?.end_reason;
		if (fromMeta !== undefined) {
			return fromMeta;
		}
		if (settlement.endReason !== undefined) {
			return settlement.endReason;
		}
		switch (settlement.outcome) {
			case 'completed':
				return 'completed';
			case 'failed':
				return 'step_error';
			case 'engine_failed':
				return 'engine_failed';
			case 'abandoned':
				return 'execution_ended';
			default:
				throw new Error(`AttemptLedger: unknown attempt outcome '${String(settlement.outcome)}'`);
		}
	}

	private static addModelFigures(entry: AttemptRecord, meta: ModelStepMeta): void {
		entry.model = meta.model;
		const cost = meta.cost;
		// Absent `reported` is a record from before the flag existed: it was a real result, read as reported
		const reported = cost.reported !== false;
		if (reported) {
			entry.usd = cost.usd;
		}
		const tokensTotal = cost.input_tokens + cost.output_tokens + cost.cache_read_tokens + cost.cache_write_tokens;
		// codex reports tokens but no cost; a killed process reports neither (its zeros are placeholders)
		if (reported || tokensTotal > 0) {
			entry.tokens = {
				input: cost.input_tokens,
				output: cost.output_tokens,
				cacheRead: cost.cache_read_tokens,
				cacheWrite: cost.cache_write_tokens,
			};
		}
		if (meta.turns !== undefined) {
			entry.turns = meta.turns;
		}
		if (meta.tool_calls !== undefined) {
			entry.toolCalls = meta.tool_calls.total;
		}
		if (meta.files_written_count !== undefined) {
			entry.filesWrittenCount = meta.files_written_count;
		}
	}

	/** Folds the oldest entries of a step past the per-step cap. */
	private static foldStep(step: StepState): void {
		const log = step.attemptLog;
		if (log === undefined || log.length <= MAX_ATTEMPTS_PER_STEP) {
			return;
		}
		for (const old of log.splice(0, log.length - MAX_ATTEMPTS_PER_STEP)) {
			AttemptLedger.fold(step, old);
		}
	}

	/** Folds the oldest entries (by end time, over all steps) past the per-execution cap. */
	private static foldExecution(state: ExecutionState): void {
		const holders = Object.values(state.steps).filter(s => (s.attemptLog?.length ?? 0) > 0);
		let total = holders.reduce((sum, s) => sum + s.attemptLog!.length, 0);
		while (total > MAX_ATTEMPTS_PER_EXECUTION) {
			let oldestHolder: StepState | undefined;
			for (const holder of holders) {
				const head = holder.attemptLog![0];
				if (
					head !== undefined &&
					(oldestHolder === undefined || head.endedAt < oldestHolder.attemptLog![0]!.endedAt)
				) {
					oldestHolder = holder;
				}
			}
			if (oldestHolder === undefined) {
				return;
			}
			AttemptLedger.fold(oldestHolder, oldestHolder.attemptLog!.shift()!);
			total--;
		}
	}

	private static fold(step: StepState, entry: AttemptRecord): void {
		const overflow = step.attemptOverflow ?? { count: 0, usd: 0, usdUnknownCount: 0, durationMs: 0 };
		step.attemptOverflow = {
			count: overflow.count + 1,
			usd: overflow.usd + (entry.usd ?? 0),
			usdUnknownCount: overflow.usdUnknownCount + (entry.usd === undefined ? 1 : 0),
			durationMs: overflow.durationMs + entry.durationMs,
		};
	}
}
