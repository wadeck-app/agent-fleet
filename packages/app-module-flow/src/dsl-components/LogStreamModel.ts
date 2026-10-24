import { type LogStreamEntry, type LogStreamStep, RUN_EVENTS_STEP } from './LogStreamProps.js';

/** A run of at least this many quiet lines of one step is folded into one row (density `folded`). */
export const FOLD_MIN_RUN = 3;

// Golden angle in degrees: consecutive orders land far apart, so the first dozen steps get clearly different hues.
const GOLDEN_ANGLE = 137.508;

function requireDuration(ms: number): void {
	if (!Number.isFinite(ms) || ms < 0) {
		throw new Error(`Cannot write the duration ${String(ms)}: expected a number of milliseconds >= 0.`);
	}
}

/** A duration as short text: 312ms, 12.3s, 1m05s, 1h02m. */
export function formatSpan(ms: number): string {
	requireDuration(ms);
	const rounded = Math.round(ms);
	if (rounded < 1000) {
		return `${rounded}ms`;
	}
	const tenths = Math.round(ms / 100);
	if (tenths < 600) {
		return `${(tenths / 10).toFixed(1)}s`;
	}
	const seconds = Math.round(ms / 1000);
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
	}
	const minutes = Math.floor(seconds / 60);
	return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

/** A duration after a plus sign: an offset from the start of the run or a delta from the previous line. */
export function formatSigned(ms: number): string {
	return `+${formatSpan(ms)}`;
}

/** The hue (0-359) that tells a step apart, from its execution order; null for a line that belongs to no step order. */
export function stepHue(order: number | null): number | null {
	return order === null ? null : Math.round((order * GOLDEN_ANGLE) % 360) % 360;
}

export interface SpanBar {
	/** Percent of the run where the bar starts. */
	left: number;
	/** Percent of the run the bar covers, at least 1. */
	width: number;
}

/** Where a step sits on the time line of the run; null when it never started or the run has no duration. */
export function spanBar(step: LogStreamStep, runDurationMs: number): SpanBar | null {
	if (step.startOffsetMs === null || step.endOffsetMs === null || runDurationMs <= 0) {
		return null;
	}
	const left = Math.min(99, Math.max(0, Math.floor((step.startOffsetMs / runDurationMs) * 100)));
	const rawWidth = ((step.endOffsetMs - step.startOffsetMs) / runDurationMs) * 100;
	const width = Math.max(1, Math.min(100 - left, Math.round(rawWidth)));
	return { left, width };
}

export type Grouping = 'flat' | 'step' | 'attempt';

/** The step a line belongs to: the step of its own, or the one a run event is about. */
export function ownerOf(entry: LogStreamEntry): string {
	return entry.subjectStepId ?? entry.stepId;
}

/** A line about the run itself, not about one step ("Execution started", "Sub-steps reset"...). */
export function isRunLevel(entry: LogStreamEntry): boolean {
	return entry.stepId === RUN_EVENTS_STEP && entry.subjectStepId === null;
}

export interface LogGroup {
	key: string;
	stepId: string | null;
	order: number | null;
	depth: number;
	/** Set in `attempt` mode only. */
	attempt: number | null;
	/** Attempts of the step seen in the log. */
	attempts: number;
	entries: LogStreamEntry[];
	errors: number;
	warnings: number;
}

function countLevel(entries: readonly LogStreamEntry[], level: string): number {
	return entries.filter(entry => entry.level === level).length;
}

function groupOf(key: string, entries: LogStreamEntry[], attempt: number | null): LogGroup {
	const first = entries[0]!;
	return {
		key,
		stepId: ownerOf(first),
		order: first.stepOrder,
		depth: first.stepDepth,
		attempt,
		attempts: first.attempts,
		entries,
		errors: countLevel(entries, 'error'),
		warnings: countLevel(entries, 'warning'),
	};
}

// Run events first, then the steps in execution order, then the steps the record does not know (first seen first).
function rankOf(entry: LogStreamEntry, firstSeen: ReadonlyMap<string, number>): number {
	if (isRunLevel(entry)) {
		return -1;
	}
	return entry.stepOrder ?? 1_000_000 + (firstSeen.get(ownerOf(entry)) ?? 0);
}

/**
 * The lines in sections. `flat` is one section in the order of the page (chronological), `step` one per step and
 * `attempt` one per attempt of a step; both put the run events first and then the steps in execution order, the lines
 * of a section staying chronological.
 */
export function groupEntries(entries: LogStreamEntry[], mode: Grouping): LogGroup[] {
	switch (mode) {
		case 'flat':
			return entries.length === 0
				? []
				: [{ ...groupOf('all', entries, null), stepId: null, order: null, depth: 0 }];
		case 'step':
		case 'attempt':
			return groupPerStep(entries, mode === 'attempt');
		default:
			throw new Error(`Unknown grouping "${String(mode)}": expected flat, step or attempt.`);
	}
}

function groupPerStep(entries: LogStreamEntry[], byAttempt: boolean): LogGroup[] {
	const firstSeen = new Map<string, number>();
	entries.forEach((entry, index) => {
		if (!firstSeen.has(ownerOf(entry))) {
			firstSeen.set(ownerOf(entry), index);
		}
	});
	const buckets = new Map<string, { entries: LogStreamEntry[]; attempt: number; rank: number }>();
	for (const entry of entries) {
		// A line stamped before the start event of its attempt still belongs to the first one.
		const attempt = isRunLevel(entry) ? 0 : Math.max(1, entry.attempt);
		const key = byAttempt ? `attempt:${ownerOf(entry)}:${attempt}` : `step:${ownerOf(entry)}`;
		const bucket = buckets.get(key) ?? { entries: [], attempt, rank: rankOf(entry, firstSeen) };
		bucket.entries.push(entry);
		buckets.set(key, bucket);
	}
	return [...buckets.entries()]
		.sort(([, a], [, b]) => a.rank - b.rank || a.attempt - b.attempt)
		.map(([key, bucket]) => groupOf(key, bucket.entries, byAttempt ? bucket.attempt : null));
}

export type StreamItem =
	{ kind: 'line'; index: number; entry: LogStreamEntry } | { kind: 'fold'; index: number; entries: LogStreamEntry[] };

// A quiet line: nothing to act on and nothing to open. Run events are the skeleton of the run and stay visible.
function isQuiet(entry: LogStreamEntry): boolean {
	return (entry.level === 'info' || entry.level === 'debug') && !entry.expandable && entry.stepId !== RUN_EVENTS_STEP;
}

/** Replaces each run of at least {@link FOLD_MIN_RUN} quiet lines of the same step by one fold item. */
export function foldQuietRuns(entries: readonly LogStreamEntry[]): StreamItem[] {
	const items: StreamItem[] = [];
	let run: { start: number; entries: LogStreamEntry[] } | null = null;
	const flush = (): void => {
		if (run === null) {
			return;
		}
		if (run.entries.length >= FOLD_MIN_RUN) {
			items.push({ kind: 'fold', index: run.start, entries: run.entries });
		} else {
			run.entries.forEach((entry, offset) => items.push({ kind: 'line', index: run!.start + offset, entry }));
		}
		run = null;
	};
	entries.forEach((entry, index) => {
		if (!isQuiet(entry)) {
			flush();
			items.push({ kind: 'line', index, entry });
			return;
		}
		if (run !== null && ownerOf(run.entries[0]!) !== ownerOf(entry)) {
			flush();
		}
		run ??= { start: index, entries: [] };
		run.entries.push(entry);
	});
	flush();
	return items;
}

/** The CSS colour of a step: `alpha` 1 for a stripe or a bar, less for a tinted background. Comma syntax works in every engine. */
export function stepColor(hue: number, alpha = 1): string {
	return `hsla(${hue}, 70%, 48%, ${alpha})`;
}
