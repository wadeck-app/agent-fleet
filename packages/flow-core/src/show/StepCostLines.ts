import type { AttemptRecord, StepState } from '../execution/ExecutionState.js';
import { type AttemptCost, formatStepCost, sumStepCosts, summarizeStepCost } from '../execution/StepCost.js';
import { formatDuration, formatModelCost } from '../history/ExecutionFormat.js';

// The cost and attempt lines of a step, shared by `flow show` and `flow history --id` so both print the same figures.

type Tokens = NonNullable<AttemptRecord['tokens']>;

/** `2 in / 4 out + 51022 cache tokens` (cache tokens are an additional volume, not included in "in"). */
function tokenText(tokens: Tokens): string {
	const cache = tokens.cacheRead + tokens.cacheWrite;
	return `${tokens.input} in / ${tokens.output} out${cache > 0 ? ` + ${cache} cache` : ''} tokens`;
}

function costPart(cost: AttemptCost | undefined): string[] {
	if (cost?.notApplicable === true) {
		return [];
	}
	return [
		cost?.usd !== undefined ? `$${cost.usd.toFixed(4)}` : `cost unknown (${cost?.unknownReason ?? 'not recorded'})`,
	];
}

function attemptLine(entry: AttemptRecord, cost: AttemptCost | undefined, indent: string): string {
	const parts = [
		`attempt ${entry.n}`,
		entry.origin.padEnd(8),
		formatDuration(entry.startedAt, entry.endedAt),
		...costPart(cost),
	];
	if (cost?.tokens !== undefined) {
		parts.push(tokenText(cost.tokens));
	}
	parts.push(entry.endReason);
	if (entry.turns !== undefined) {
		parts.push(`turns ${entry.turns}`);
	}
	if (entry.toolCalls !== undefined) {
		parts.push(`tools ${entry.toolCalls}`);
	}
	return indent + parts.join('  ');
}

/**
 * Lines under a step: one per attempt when it ran several times (number, origin, duration, own share of the cost,
 * tokens, end reason, turns, tool calls), then the step cost. Empty for a step without model cost.
 */
export function renderStepCostLines(step: StepState, indent: string): string[] {
	const summary = summarizeStepCost(step);
	const label = formatStepCost(summary);
	const log = step.attemptLog ?? [];
	if (label === undefined) {
		// Non-model step: the attempts are still listed when it ran several times, without any cost.
		return log.length < 2 ? [] : log.map((entry, index) => attemptLine(entry, summary.attempts[index], indent));
	}
	if (log.length < 2) {
		const line = formatModelCost(step.meta, label);
		return line === undefined ? [] : [indent + line];
	}
	return [
		...log.map((entry, index) => attemptLine(entry, summary.attempts[index], indent)),
		`${indent}cost: ${label} over ${summary.attemptCount} attempts`,
	];
}

/** `  Total cost: $0.0200`, `$1.0000+ (1 attempt unknown)`, `unknown`; undefined when no step has a model cost. */
export function renderTotalCostLine(steps: readonly StepState[], indent: string): string | undefined {
	const label = formatStepCost(sumStepCosts(steps.map(step => summarizeStepCost(step))));
	return label === undefined ? undefined : `${indent}Total cost: ${label}`;
}
