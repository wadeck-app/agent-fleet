import type { AttemptOrigin, AttemptOutcome, StepState } from '../execution/ExecutionState.js';
import type { StepCostSummary } from '../execution/StepCost.js';
import { formatDuration } from '../history/ExecutionFormat.js';

/** One settled attempt of a step, for display. `costUsd` is this attempt's own share (see StepCost), absent when unknown. */
export interface StepAttemptView {
	n: number;
	origin: AttemptOrigin;
	outcome: AttemptOutcome;
	endReason: string;
	duration: string;
	durationMs: number;
	costUsd?: number;
	/** Why `costUsd` is absent. */
	costUnknownReason?: string;
	/** True for an attempt of a non-model step (script, ...): cost does not apply, so it is neither a value nor unknown. */
	costNotApplicable?: true;
	/** Tokens of this attempt alone (a delta for a shared claude session). */
	tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	turns?: number;
	toolCalls?: number;
	filesWrittenCount?: number;
	error?: string;
}

/** The settled attempts of a step with their own share of the cost (`costs` from `summarizeStepCost`); undefined without a log. */
export function toStepAttemptViews(step: StepState, costs: StepCostSummary): StepAttemptView[] | undefined {
	if (step.attemptLog === undefined || step.attemptLog.length === 0) {
		return undefined;
	}
	return step.attemptLog.map((entry, index) => {
		const cost = costs.attempts[index];
		return {
			n: entry.n,
			origin: entry.origin,
			outcome: entry.outcome,
			endReason: entry.endReason,
			duration: formatDuration(entry.startedAt, entry.endedAt),
			durationMs: entry.durationMs,
			...(cost?.usd !== undefined ? { costUsd: cost.usd } : {}),
			...(cost?.unknownReason !== undefined ? { costUnknownReason: cost.unknownReason } : {}),
			...(cost?.notApplicable === true ? { costNotApplicable: true as const } : {}),
			...(cost?.tokens !== undefined ? { tokens: cost.tokens } : {}),
			...(entry.turns !== undefined ? { turns: entry.turns } : {}),
			...(entry.toolCalls !== undefined ? { toolCalls: entry.toolCalls } : {}),
			...(entry.filesWrittenCount !== undefined ? { filesWrittenCount: entry.filesWrittenCount } : {}),
			...(entry.error !== undefined ? { error: entry.error } : {}),
		};
	});
}
