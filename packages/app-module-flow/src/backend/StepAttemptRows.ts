import type { StepAttemptView, StepView } from 'flow-core';

/** One line of the attempts table under a step row; every cell is display-ready text. */
export interface AttemptRow {
	n: number;
	origin: string;
	duration: string;
	/** This attempt's own share (`$0.0064`), `unknown`, or `-` for a step without model cost. */
	cost: string;
	tokens: string;
	turns: string;
	toolCalls: string;
	endReason: string;
}

/** Wording when an unknown cost came without a reason (an older record). */
const NO_REASON = 'not recorded';

/** `2 in / 4 out + 120 cache`: the same figures as `flow show`, without the trailing word. */
function tokenText(tokens: NonNullable<StepAttemptView['tokens']>): string {
	const cache = tokens.cacheRead + tokens.cacheWrite;
	return `${tokens.input} in / ${tokens.output} out${cache > 0 ? ` + ${cache} cache` : ''}`;
}

function toAttemptRow(attempt: StepAttemptView): AttemptRow {
	const known = attempt.costUsd !== undefined;
	return {
		n: attempt.n,
		origin: attempt.origin,
		duration: attempt.duration,
		cost: known ? `$${attempt.costUsd!.toFixed(4)}` : attempt.costNotApplicable === true ? '-' : 'unknown',
		tokens: attempt.tokens !== undefined ? tokenText(attempt.tokens) : '-',
		turns: attempt.turns !== undefined ? String(attempt.turns) : '-',
		toolCalls: attempt.toolCalls !== undefined ? String(attempt.toolCalls) : '-',
		endReason: attempt.endReason,
	};
}

export function toAttemptRows(history: readonly StepAttemptView[]): AttemptRow[] {
	return history.map(toAttemptRow);
}

/** Whether the step row opens an attempts table: it ran 2+ times, or its (model) cost is unknown and needs its reason. */
export function hasAttemptRows(step: StepView): boolean {
	const history = step.attemptHistory ?? [];
	return history.length >= 2 || history.some(attempt => attempt.costUnknownReason !== undefined);
}

/** Points a cost cell that says "unknown" at the table that explains it; other labels are returned as they are. */
export function withCostHint(costLabel: string, expandable: boolean): string {
	return expandable && costLabel.includes('unknown') ? `${costLabel} - see attempts` : costLabel;
}

/**
 * Why the cost of the attempts is unknown, as markdown for the text under the attempts table (a reason is a long sentence:
 * a table cell would widen the whole page). One sentence when all share the reason, else one line per attempt; empty when
 * no attempt has an unknown cost.
 */
export function costNotes(history: readonly StepAttemptView[]): string {
	const unknown = history.filter(attempt => attempt.costUsd === undefined && attempt.costNotApplicable !== true);
	if (unknown.length === 0) {
		return '';
	}
	const reasons = unknown.map(attempt => ({ n: attempt.n, reason: attempt.costUnknownReason ?? NO_REASON }));
	if (new Set(reasons.map(entry => entry.reason)).size === 1) {
		return `Cost unknown: ${reasons[0]!.reason}.`;
	}
	return `Cost unknown:\n\n${reasons.map(entry => `- attempt ${entry.n}: ${entry.reason}`).join('\n')}`;
}
