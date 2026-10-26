import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';

/** The keys a `flow:RunBars` node may carry: the data and the page a bar leads to, nothing that styles the bars. */
export const RUN_BARS_KEYS = ['days', 'to'] as const;

export interface RunBarsProps {
	days: unknown;
	/** App path of the executions page, without query: a bar adds ?status=. */
	to: unknown;
	/** Keys of the node outside the contract (the platform checks only the root $type, never the props). */
	unexpectedKeys: string[];
}

export interface RunBarsDay {
	dayStart: Date;
	completed: number;
	failed: number;
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
		days: resolveExpressionValue(node['days'], ctx),
		to: resolveExpressionValue(node['to'], ctx),
		// "$type", "$if" and the like belong to the engine, not to the node.
		unexpectedKeys: Object.keys(node)
			.filter(key => !key.startsWith('$') && !declared.includes(key))
			.sort(),
	};
}

/** The entries of the `days` list, or an error that names the day and the field that is wrong. */
export function parseRunBarsDays(days: unknown): RunBarsDay[] {
	if (!Array.isArray(days)) {
		throw new Error(
			`flow:RunBars days must be a list of days (for example days: $sources.recent.daily), got ${JSON.stringify(days) ?? 'nothing'}.`
		);
	}
	return days.map((day: unknown, index) => {
		const field = (name: string): unknown =>
			typeof day === 'object' && day !== null ? Reflect.get(day, name) : undefined;
		const count = (name: string): number => {
			const value = field(name);
			if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
				throw new Error(
					`flow:RunBars day ${index} ${name} must be a count (0 or more), got ${JSON.stringify(value) ?? 'nothing'}.`
				);
			}
			return value;
		};
		const start = field('dayStart');
		const dayStart = typeof start === 'string' ? new Date(start) : new Date(Number.NaN);
		if (Number.isNaN(dayStart.getTime())) {
			throw new Error(
				`flow:RunBars day ${index} dayStart must be an ISO 8601 time, got ${JSON.stringify(start) ?? 'nothing'}.`
			);
		}
		return { dayStart, completed: count('completed'), failed: count('failed') };
	});
}

/** Height of every bar in percent of its column, all scaled on the busiest bar of the whole week. */
export function barHeights(days: readonly RunBarsDay[]): RunBarsHeights[] {
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
