import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';

import type { RunBarsRun } from './RunBarsDays.js';

/** The keys a `flow:RunBars` node may carry: the runs, whether the list is cut, and the page a bar leads to; nothing that styles the bars. */
export const RUN_BARS_KEYS = ['runs', 'truncated', 'to'] as const;

export interface RunBarsProps {
	/** Finished runs of the last days, `{ startedAt (ISO 8601), status }` each: the component buckets them per day. */
	runs: unknown;
	/** True when `runs` holds only the newest runs (the source hit its cap): the oldest days may be short. */
	truncated: unknown;
	/** App path of the executions page, without query: a bar adds ?status=. */
	to: unknown;
	/** Keys of the node outside the contract (the platform checks only the root $type, never the props). */
	unexpectedKeys: string[];
}

export interface RunBarsHeights {
	completed: number;
	failed: number;
}

/** A bar of at least one run is never thinner than this share of the column, or it vanishes next to a busy one. */
const MIN_VISIBLE_PERCENT = 8;

/** Reads the node: the declared values resolved against the context, and the undeclared keys. */
export function readRunBarsProps(node: Record<string, unknown>, ctx: Record<string, unknown>): RunBarsProps {
	const declared: readonly string[] = RUN_BARS_KEYS;
	return {
		runs: resolveExpressionValue(node['runs'], ctx),
		truncated: resolveExpressionValue(node['truncated'], ctx),
		to: resolveExpressionValue(node['to'], ctx),
		// "$type", "$if" and the like belong to the engine, not to the node.
		unexpectedKeys: Object.keys(node)
			.filter(key => !key.startsWith('$') && !declared.includes(key))
			.sort(),
	};
}

/** The entries of the `runs` list, or an error that names the run and the field that is wrong. */
export function parseRunBarsRuns(runs: unknown): RunBarsRun[] {
	if (!Array.isArray(runs)) {
		throw new Error(
			`flow:RunBars runs must be a list of runs (for example runs: $sources.recent.recentRuns), got ${JSON.stringify(runs) ?? 'nothing'}.`
		);
	}
	return runs.map((run: unknown, index) => {
		const field = (name: string): unknown =>
			typeof run === 'object' && run !== null ? Reflect.get(run, name) : undefined;
		const start = field('startedAt');
		const startedAt = typeof start === 'string' ? new Date(start) : new Date(Number.NaN);
		if (Number.isNaN(startedAt.getTime())) {
			throw new Error(
				`flow:RunBars run ${index} startedAt must be an ISO 8601 time, got ${JSON.stringify(start) ?? 'nothing'}.`
			);
		}
		const status = field('status');
		if (status !== 'completed' && status !== 'failed') {
			throw new Error(
				`flow:RunBars run ${index} status must be "completed" or "failed", got ${JSON.stringify(status) ?? 'nothing'}.`
			);
		}
		return { startedAt, status };
	});
}

/** The `truncated` flag: a boolean, never guessed from something else. */
export function parseRunBarsTruncated(truncated: unknown): boolean {
	if (typeof truncated !== 'boolean') {
		throw new Error(
			`flow:RunBars truncated must be true or false (for example truncated: $sources.recent.recentRunsTruncated), got ${JSON.stringify(truncated) ?? 'nothing'}.`
		);
	}
	return truncated;
}

/** Height of every bar in percent of its column, all scaled on the busiest bar of the whole week. */
export function barHeights(days: readonly RunBarsHeights[]): RunBarsHeights[] {
	const busiest = Math.max(0, ...days.flatMap(day => [day.completed, day.failed]));
	const percent = (count: number): number =>
		count === 0 ? 0 : Math.max(MIN_VISIBLE_PERCENT, Math.round((count / busiest) * 100));
	return days.map(day => ({ completed: percent(day.completed), failed: percent(day.failed) }));
}

/**
 * The executions page filtered on the status a bar stands for. `to` is the app path of the page (no query, no host): a
 * bar must never leave the app. The page has no date filter, so the link shows every run of that status, not the day's.
 */
export function barLink(to: unknown, status: 'completed' | 'failed'): string {
	if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || /[?#]/.test(to)) {
		throw new Error(
			`flow:RunBars to must be an app path without query such as /modules/flow/executions, got ${JSON.stringify(to) ?? 'nothing'}.`
		);
	}
	return `${to}?status=${status}`;
}
