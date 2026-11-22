import type { AttemptRecord, StepState } from './ExecutionState.js';

// The ONE place that turns the recorded per-attempt costs of a step into figures to show.
//
// Measured (one real capture, claude): the usd and token counts a claude session reports are CUMULATIVE for the
// session. A relaunch resumes the session, so attempt 2 reports attempt 1 + its own turn. Summing the raw values
// double counts. Measured too (codex-cli 0.171.0, `codex exec resume`): the usage of a resumed codex thread is
// CUMULATIVE for the thread (turn 2 reported output 5+5, cache write 9302+22, input 9344+9366), so codex follows the
// same rule as claude. Measured the other way for opencode (`--session`): each attempt reports its OWN turn only
// (turn 2: input 2, output 5, cache write 24, cost 0.0108 against turn 1: 19089 cache write, cost 0.1314), so
// opencode attempts of a shared session are plain per-attempt values, summed, never turned into deltas. Rules:
// - attempts of one claude or codex session: the cost of an attempt is the delta against the previous attempt of that
//   session (the first counts in full); the step total adds the final cumulative value of each session;
// - opencode attempts: each attempt costs its own value, the step total is their sum;
// - an attempt whose usd is an ESTIMATE (codex: no cost reported, priced from the usage with a local table) keeps its
//   `estimated` flag and the date of the price table: the figures derived from it (delta, totals) are estimates too;
// - anything that cannot be established is UNKNOWN, never 0: no cost, a cumulative value that decreases, a
//   missing session id or provider, a provider other than claude, codex or opencode whose session is shared (semantics
//   unverified);
// - a total with unknown parts is a lower bound (`complete: false`);
// - cost only exists for MODEL steps. A step is a model step when the record shows any model trace: an attempt log
//   entry with model, provider, sessionId, usd or tokens, or a `meta` with model or cost. A step with none of these
//   (script, user_intervention, subflow, or a model step that left no trace at all) is NOT APPLICABLE: it
//   contributes nothing to any total (neither a value nor an unknown), prints no cost, and never makes a total
//   incomplete. The record carries no step type, so this is the most reliable signal valid for old records too.

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

/** Providers whose reported usd and tokens are cumulative for the session (measured). */
const CUMULATIVE_PROVIDERS: ReadonlySet<string> = new Set(['claude', 'codex']);
/** Providers whose reported usd and tokens describe the attempt alone (measured). */
const PER_ATTEMPT_PROVIDERS: ReadonlySet<string> = new Set(['opencode']);

/** The oldest of two price table dates (ISO dates compare as text); the estimate is only as fresh as its oldest part. */
function olderDate(first: string | undefined, second: string | undefined): string | undefined {
	if (first === undefined || second === undefined) {
		return first ?? second;
	}
	return first <= second ? first : second;
}

/** Cost of one attempt. `usd` is the share of this attempt (a delta for a shared claude or codex session), absent when unknown. */
export interface AttemptCost {
	n: number;
	usd?: number;
	/** True when `usd` is an estimate (priced locally from the usage), not a provider report. */
	estimated?: true;
	/** Date of the price table behind an estimated `usd`. */
	pricesAsOf?: string;
	/** Tokens of this attempt alone (a delta for a shared claude session); absent when the cost is unknown or they went backwards. */
	tokens?: Tokens;
	/** Why `usd` is unknown. */
	unknownReason?: string;
	/** True for an attempt of a non-model step: cost does not exist (neither a value nor an unknown). */
	notApplicable?: true;
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
	/** True when `totalUsd` includes an estimated attempt: the whole figure is then an estimate. */
	estimated?: true;
	/** Oldest price table date among the estimated parts of `totalUsd`. */
	pricesAsOf?: string;
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
	/** `last` is an estimate, with the date of its price table. */
	lastEstimated?: true;
	lastPricesAsOf?: string;
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

/** `estimated` and `pricesAsOf` of an attempt entry, to spread into its cost. */
function estimateOf(entry: AttemptRecord): Pick<AttemptCost, 'estimated' | 'pricesAsOf'> {
	return entry.estimated === true
		? { estimated: true, ...(entry.pricesAsOf === undefined ? {} : { pricesAsOf: entry.pricesAsOf }) }
		: {};
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
		return unknownAttempt(n, entry.usdUnknownReason ?? 'the provider reported no cost for this attempt');
	}
	if (provider !== undefined && PER_ATTEMPT_PROVIDERS.has(provider)) {
		// Measured: each opencode attempt reports its own turn, even in a shared session. Nothing to subtract.
		return { n, usd, ...estimateOf(entry), ...tokensOf(entry.tokens) };
	}
	if (provider !== undefined && CUMULATIVE_PROVIDERS.has(provider)) {
		if (cursor === undefined) {
			return totalAttempts === 1
				? { n, usd, ...estimateOf(entry), ...tokensOf(entry.tokens) }
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
		delete cursor.lastEstimated;
		delete cursor.lastPricesAsOf;
		if (entry.estimated === true) {
			cursor.lastEstimated = true;
			if (entry.pricesAsOf !== undefined) {
				cursor.lastPricesAsOf = entry.pricesAsOf;
			}
		}
		cursor.followsUnknown = false;
		if (followed) {
			return unknownAttempt(n, 'follows an attempt of the same session whose cost is unknown');
		}
		if (previous === undefined) {
			return { n, usd, ...estimateOf(entry), ...tokensOf(entry.tokens) };
		}
		const tokens =
			entry.tokens === undefined || previousTokens === undefined
				? undefined
				: tokensDelta(entry.tokens, previousTokens);
		return { n, usd: usd - previous, ...estimateOf(entry), ...tokensOf(tokens) };
	}
	// Other providers: the cost of a shared session is not verified to be cumulative or per process.
	const alone = key === undefined ? totalAttempts === 1 : log.filter(other => other.sessionId === key).length === 1;
	if (alone) {
		return { n, usd, ...estimateOf(entry), ...tokensOf(entry.tokens) };
	}
	return unknownAttempt(
		n,
		`provider '${provider ?? 'unrecorded'}' shares a session between attempts and its cost semantics are unverified`
	);
}

function isModelAttempt(entry: AttemptRecord): boolean {
	return (
		entry.model !== undefined ||
		entry.provider !== undefined ||
		entry.sessionId !== undefined ||
		entry.usd !== undefined ||
		entry.tokens !== undefined
	);
}

function hasModelMeta(meta: StepCostInput['meta']): boolean {
	return meta !== undefined && ('model' in meta || 'cost' in meta);
}

function summarizeLog(log: AttemptRecord[], step: StepCostInput): StepCostSummary {
	if (!log.some(isModelAttempt) && !hasModelMeta(step.meta)) {
		return {
			basis: 'none',
			attempts: log.map(entry => ({ n: entry.n, notApplicable: true as const })),
			attemptCount: log.length + (step.attemptOverflow?.count ?? 0),
			complete: true,
			unknownAttempts: 0,
		};
	}
	const overflow = step.attemptOverflow?.count ?? 0;
	const totalAttempts = log.length + overflow;
	const sessions = new Map<string, SessionCursor>();
	const attempts = log.map(entry => costOfAttempt(entry, log, totalAttempts, sessions));
	// Cumulative sessions (claude, codex) add their final cumulative value; every other known share (an opencode
	// attempt, an attempt of an unverified provider alone in its session, a lone attempt without session id) is a
	// whole cost of its own.
	let total: number | undefined;
	let estimated = false;
	let pricesAsOf: string | undefined;
	const add = (value: number, estimate: { estimated?: true; pricesAsOf?: string }): void => {
		total = (total ?? 0) + value;
		if (estimate.estimated === true) {
			estimated = true;
			pricesAsOf = olderDate(pricesAsOf, estimate.pricesAsOf);
		}
	};
	for (const cursor of sessions.values()) {
		if (cursor.last !== undefined) {
			add(cursor.last, {
				...(cursor.lastEstimated === true ? { estimated: true as const } : {}),
				...(cursor.lastPricesAsOf === undefined ? {} : { pricesAsOf: cursor.lastPricesAsOf }),
			});
		}
	}
	log.forEach((entry, index) => {
		const attemptCost = attempts[index]!;
		const inCumulativeSession =
			entry.provider !== undefined &&
			CUMULATIVE_PROVIDERS.has(entry.provider) &&
			entry.sessionId !== undefined &&
			entry.sessionId !== '';
		if (attemptCost.usd !== undefined && !inCumulativeSession) {
			add(attemptCost.usd, attemptCost);
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
		...(estimated ? { estimated: true as const } : {}),
		...(estimated && pricesAsOf !== undefined ? { pricesAsOf } : {}),
		...(last?.usd !== undefined ? { lastAttemptUsd: last.usd } : {}),
	};
}

function summarizeWithoutLog(step: StepCostInput): StepCostSummary {
	const meta = step.meta as
		{ cost?: { usd: number; reported?: boolean; estimated?: true; pricesAsOf?: string } } | undefined;
	const attemptCount = step.attempts ?? 1;
	if (meta?.cost === undefined) {
		return { basis: 'none', attempts: [], attemptCount: step.attempts ?? 0, complete: true, unknownAttempts: 0 };
	}
	const estimate =
		meta.cost.estimated === true
			? {
					estimated: true as const,
					...(meta.cost.pricesAsOf === undefined ? {} : { pricesAsOf: meta.cost.pricesAsOf }),
				}
			: {};
	// An estimate is not a provider report (`reported` is false) but it is a figure
	if (meta.cost.reported === false && meta.cost.estimated !== true) {
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
			...estimate,
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
		...estimate,
	};
}

/** The cost of a step: per-attempt shares, total, and whether the total is complete. Pure. */
export function summarizeStepCost(step: StepCostInput): StepCostSummary {
	const log = step.attemptLog ?? [];
	return log.length > 0 ? summarizeLog(log, step) : summarizeWithoutLog(step);
}

/** Adds the totals of several steps; steps without any model cost are ignored. An estimated part makes the sum an estimate. */
export function sumStepCosts(summaries: readonly CostTotal[]): CostTotal {
	const costed = summaries.filter(s => s.basis !== 'none');
	if (costed.length === 0) {
		return { basis: 'none', complete: true, unknownAttempts: 0, attemptCount: 0 };
	}
	const known = costed.filter(s => s.totalUsd !== undefined);
	const estimatedParts = known.filter(s => s.estimated === true);
	const pricesAsOf = estimatedParts.reduce<string | undefined>(
		(oldest, s) => olderDate(oldest, s.pricesAsOf),
		undefined
	);
	return {
		basis: 'log',
		complete: costed.every(s => s.complete),
		unknownAttempts: costed.reduce((sum, s) => sum + s.unknownAttempts, 0),
		attemptCount: costed.reduce((sum, s) => sum + s.attemptCount, 0),
		...(known.length > 0 ? { totalUsd: known.reduce((sum, s) => sum + s.totalUsd!, 0) } : {}),
		...(estimatedParts.length > 0 ? { estimated: true as const } : {}),
		...(pricesAsOf === undefined ? {} : { pricesAsOf }),
	};
}

/** `estimated, prices of 2026-11-08`: what the reader needs to weigh an estimated figure. */
export function estimateNote(cost: Pick<CostTotal, 'pricesAsOf'>): string {
	return cost.pricesAsOf === undefined ? 'estimated' : `estimated, prices of ${cost.pricesAsOf}`;
}

/**
 * The text of a cost: `$0.0075`, `$2.7900+ (2 attempts unknown)`, `unknown`, or undefined when there is no model cost.
 * An estimated figure is marked: `~$0.0123 (estimated, prices of 2026-11-08)`. An unknown cost is never printed as `$0`.
 */
export function formatStepCost(cost: CostTotal): string | undefined {
	if (cost.basis === 'none') {
		return undefined;
	}
	if (cost.totalUsd === undefined) {
		return 'unknown';
	}
	const estimated = cost.estimated === true;
	const amount = `${estimated ? '~' : ''}$${cost.totalUsd.toFixed(4)}`;
	if (cost.complete) {
		return estimated ? `${amount} (${estimateNote(cost)})` : amount;
	}
	const estimateSuffix = estimated ? `; ${estimateNote(cost)}` : '';
	if (cost.basis === 'last-attempt-only') {
		return `${amount} (last attempt of ${cost.attemptCount}, earlier not recorded${estimateSuffix})`;
	}
	return `${amount}+ (${cost.unknownAttempts} ${cost.unknownAttempts === 1 ? 'attempt' : 'attempts'} unknown${estimateSuffix})`;
}
