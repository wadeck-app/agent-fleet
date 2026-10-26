import type { AttemptRecord, StepState } from './ExecutionState.js';

// The ONE place that turns the recorded per-attempt costs of a step into figures to show.
//
// Measured (one real capture, claude): the usd and token counts a claude session reports are CUMULATIVE for the
// session. A relaunch resumes the session, so attempt 2 reports attempt 1 + its own turn. Summing the raw values
// double counts. Rules:
// - attempts of one claude session: the cost of an attempt is the delta against the previous attempt of that session
//   (the first counts in full); the step total adds the final cumulative value of each session;
// - anything that cannot be established is UNKNOWN, never 0: no reported cost, a cumulative value that decreases, a
//   missing session id or provider, a provider other than claude whose session is shared (semantics unverified);
// - a total with unknown parts is a lower bound (`complete: false`).

type Tokens = NonNullable<AttemptRecord['tokens']>;

function tokensDelta(current: Tokens, previous: Tokens): Tokens | undefined {
	const delta = {
		input: current.input - previous.input,
		output: current.output - previous.output,
		cacheRead: current.cacheRead - previous.cacheRead,
		cacheWrite: current.cacheWrite - previous.cacheWrite,
	};
	return Object.values(delta).some(value => value < 0) ? undefined : delta;
}

/** Cost of one attempt. `usd` is the share of this attempt (a delta for a shared claude session), absent when unknown. */
export interface AttemptCost {
	n: number;
	usd?: number;
	/** Tokens of this attempt alone (a delta for a shared claude session); absent when the cost is unknown or they went backwards. */
	tokens?: Tokens;
	/** Why `usd` is unknown. */
	unknownReason?: string;
}

/**
 * - `log`: computed from the attempt log;
 * - `meta`: record without a log, the step ran once;
 * - `last-attempt-only`: record without a log, the step ran several times: only the last attempt's cost exists;
 * - `none`: the step has no model cost at all (script step, never ran).
 */
export type StepCostBasis = 'log' | 'meta' | 'last-attempt-only' | 'none';

export interface CostTotal {
	/** Sum of what is known; a lower bound when `complete` is false; absent when nothing is known. */
	totalUsd?: number;
	complete: boolean;
	unknownAttempts: number;
	basis: StepCostBasis;
	/** Attempts the step ran (known ones: log entries, or `attempts` of an old record). */
	attemptCount: number;
}

export interface StepCostSummary extends CostTotal {
	/** One per log entry; empty for a record without a log. */
	attempts: AttemptCost[];
	/** Cost of the last attempt alone (the delta); absent when unknown. */
	lastAttemptUsd?: number;
}

export type StepCostInput = Pick<StepState, 'attemptLog' | 'attemptOverflow' | 'meta' | 'attempts'>;

interface SessionCursor {
	/** Last known cumulative value. */
	last?: number;
	/** Cumulative tokens of the attempt that set `last`. */
	lastTokens?: Tokens;
	/** The previous attempt of the session had no cost: the next delta spans it. */
	followsUnknown: boolean;
	/** The cumulative value decreased once: nothing after it can be trusted. */
	broken: boolean;
}

function tokensOf(tokens: Tokens | undefined): { tokens?: Tokens } {
	return tokens === undefined ? {} : { tokens };
}

function unknownAttempt(n: number, unknownReason: string): AttemptCost {
	return { n, unknownReason };
}

function costOfAttempt(
	entry: AttemptRecord,
	log: AttemptRecord[],
	totalAttempts: number,
	sessions: Map<string, SessionCursor>
): AttemptCost {
	const { n, usd, sessionId, provider } = entry;
	const key = sessionId === undefined || sessionId === '' ? undefined : sessionId;
	const cursor = key === undefined ? undefined : (sessions.get(key) ?? { followsUnknown: false, broken: false });
	if (key !== undefined && cursor !== undefined) {
		sessions.set(key, cursor);
	}
	if (usd === undefined) {
		if (cursor !== undefined) {
			cursor.followsUnknown = true;
		}
		return unknownAttempt(n, 'the provider reported no cost for this attempt');
	}
	if (provider === 'claude') {
		if (cursor === undefined) {
			return totalAttempts === 1
				? { n, usd, ...tokensOf(entry.tokens) }
				: unknownAttempt(n, 'no session id recorded, so the cumulative cost cannot be split between attempts');
		}
		if (cursor.broken) {
			return unknownAttempt(n, 'the session cost decreased earlier, later attempts cannot be trusted');
		}
		const previous = cursor.last;
		const followed = cursor.followsUnknown;
		if (previous !== undefined && usd < previous) {
			cursor.broken = true;
			return unknownAttempt(n, `the cumulative session cost decreased (${previous} then ${usd})`);
		}
		const previousTokens = cursor.lastTokens;
		cursor.last = usd;
		cursor.lastTokens = entry.tokens;
		cursor.followsUnknown = false;
		if (followed) {
			return unknownAttempt(n, 'follows an attempt of the same session whose cost is unknown');
		}
		if (previous === undefined) {
			return { n, usd, ...tokensOf(entry.tokens) };
		}
		const tokens =
			entry.tokens === undefined || previousTokens === undefined
				? undefined
				: tokensDelta(entry.tokens, previousTokens);
		return { n, usd: usd - previous, ...tokensOf(tokens) };
	}
	// Other providers: the cost of a shared session is not verified to be cumulative or per process.
	const alone = key === undefined ? totalAttempts === 1 : log.filter(other => other.sessionId === key).length === 1;
	if (alone) {
		return { n, usd, ...tokensOf(entry.tokens) };
	}
	return unknownAttempt(
		n,
		`provider '${provider ?? 'unrecorded'}' shares a session between attempts and its cost semantics are unverified`
	);
}

function summarizeLog(log: AttemptRecord[], step: StepCostInput): StepCostSummary {
	const overflow = step.attemptOverflow?.count ?? 0;
	const totalAttempts = log.length + overflow;
	const sessions = new Map<string, SessionCursor>();
	const attempts = log.map(entry => costOfAttempt(entry, log, totalAttempts, sessions));
	// Claude sessions add their final cumulative value; every other known share (a non-claude attempt alone in its
	// session, a lone claude attempt without session id) is a whole cost of its own.
	let total: number | undefined;
	const add = (value: number): void => {
		total = (total ?? 0) + value;
	};
	for (const cursor of sessions.values()) {
		if (cursor.last !== undefined) {
			add(cursor.last);
		}
	}
	log.forEach((entry, index) => {
		const usd = attempts[index]!.usd;
		const inClaudeSession = entry.provider === 'claude' && entry.sessionId !== undefined && entry.sessionId !== '';
		if (usd !== undefined && !inClaudeSession) {
			add(usd);
		}
	});
	const unknownAttempts = attempts.filter(a => a.usd === undefined).length + overflow;
	const last = attempts.at(-1);
	return {
		basis: 'log',
		attempts,
		attemptCount: totalAttempts,
		complete: unknownAttempts === 0,
		unknownAttempts,
		...(total !== undefined ? { totalUsd: total } : {}),
		...(last?.usd !== undefined ? { lastAttemptUsd: last.usd } : {}),
	};
}

function summarizeWithoutLog(step: StepCostInput): StepCostSummary {
	const meta = step.meta as { cost?: { usd: number; reported?: boolean } } | undefined;
	const attemptCount = step.attempts ?? 1;
	if (meta?.cost === undefined) {
		return { basis: 'none', attempts: [], attemptCount: step.attempts ?? 0, complete: true, unknownAttempts: 0 };
	}
	if (meta.cost.reported === false) {
		return { basis: 'meta', attempts: [], attemptCount, complete: false, unknownAttempts: attemptCount };
	}
	const usd = meta.cost.usd;
	if (attemptCount > 1) {
		return {
			basis: 'last-attempt-only',
			attempts: [],
			attemptCount,
			totalUsd: usd,
			lastAttemptUsd: usd,
			complete: false,
			unknownAttempts: attemptCount - 1,
		};
	}
	return {
		basis: 'meta',
		attempts: [],
		attemptCount,
		totalUsd: usd,
		lastAttemptUsd: usd,
		complete: true,
		unknownAttempts: 0,
	};
}

/** The cost of a step: per-attempt shares, total, and whether the total is complete. Pure. */
export function summarizeStepCost(step: StepCostInput): StepCostSummary {
	const log = step.attemptLog ?? [];
	return log.length > 0 ? summarizeLog(log, step) : summarizeWithoutLog(step);
}

/** Adds the totals of several steps; steps without any model cost are ignored. */
export function sumStepCosts(summaries: readonly CostTotal[]): CostTotal {
	const costed = summaries.filter(s => s.basis !== 'none');
	if (costed.length === 0) {
		return { basis: 'none', complete: true, unknownAttempts: 0, attemptCount: 0 };
	}
	const known = costed.flatMap(s => (s.totalUsd === undefined ? [] : [s.totalUsd]));
	return {
		basis: 'log',
		complete: costed.every(s => s.complete),
		unknownAttempts: costed.reduce((sum, s) => sum + s.unknownAttempts, 0),
		attemptCount: costed.reduce((sum, s) => sum + s.attemptCount, 0),
		...(known.length > 0 ? { totalUsd: known.reduce((sum, usd) => sum + usd, 0) } : {}),
	};
}

/**
 * The text of a cost: `$0.0075`, `$2.7900+ (2 attempts unknown)`, `unknown`, or undefined when there is no model cost.
 * An unknown cost is never printed as `$0`.
 */
export function formatStepCost(cost: CostTotal): string | undefined {
	if (cost.basis === 'none') {
		return undefined;
	}
	if (cost.totalUsd === undefined) {
		return 'unknown';
	}
	const amount = `$${cost.totalUsd.toFixed(4)}`;
	if (cost.complete) {
		return amount;
	}
	if (cost.basis === 'last-attempt-only') {
		return `${amount} (last attempt of ${cost.attemptCount}, earlier not recorded)`;
	}
	return `${amount}+ (${cost.unknownAttempts} ${cost.unknownAttempts === 1 ? 'attempt' : 'attempts'} unknown)`;
}
