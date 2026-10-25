import { RUN_BARS_KEYS, type RunBarsProps, barHeights, dayLabel, parseRunBarsDays } from './RunBarsProps.js';

function refusal(children: string) {
	return (
		<span role="alert" className="text-xs text-danger-text">
			{children}
		</span>
	);
}

const TITLE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The runs of the last days of the dashboard card: one equal column per day over the whole width of the tile, a green bar
 * (completed) and a red bar (failed) in it, the weekday letter under it. A day without run keeps its column and draws a
 * thin baseline, so a quiet week reads as seven days and not as two bars squeezed against the right edge (the dsl-ui Chart
 * draws nothing for a zero). The bars fill the height of the box; hover a day for the date and the counts.
 *
 * Local stand-in for a dsl-ui bar chart that keeps empty categories: when one ships, change `$type: flow:RunBars` in the
 * view and delete this component. Props are closed (days): anything else renders an error, so nobody restyles it.
 */
export function RunBars({ days, unexpectedKeys }: RunBarsProps) {
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow:RunBars does not accept ${unexpectedKeys.join(', ')}: its style is fixed. Keep only ${RUN_BARS_KEYS.join(', ')}.`
		);
	}
	let parsed;
	try {
		parsed = parseRunBarsDays(days);
	} catch (err) {
		return refusal((err as Error).message);
	}
	if (parsed.length === 0) {
		return <p className="px-3 py-2 text-sm text-muted">No data</p>;
	}
	const heights = barHeights(parsed);
	const completed = parsed.reduce((sum, day) => sum + day.completed, 0);
	const failed = parsed.reduce((sum, day) => sum + day.failed, 0);
	return (
		<div
			role="img"
			aria-label={`Runs of the last ${parsed.length} days: ${completed} completed, ${failed} failed`}
			className="grid h-[4.75rem] w-full gap-1 rounded-md border border-border px-2 pb-1 pt-2"
			style={{ gridTemplateColumns: `repeat(${parsed.length}, minmax(0, 1fr))` }}
		>
			{parsed.map((day, index) => (
				<div
					key={day.dayStart.toISOString()}
					data-testid="run-bars-day"
					title={`${TITLE_FORMAT.format(day.dayStart)}: ${day.completed} completed, ${day.failed} failed`}
					className="flex min-h-0 min-w-0 flex-col gap-0.5"
				>
					<div className="relative flex min-h-0 flex-1 items-end justify-center gap-0.5 px-0.5">
						{day.completed === 0 && day.failed === 0 ? (
							<div data-testid="run-bars-baseline" className="h-0.5 w-full rounded-full bg-border" />
						) : (
							<>
								<div
									data-testid="run-bars-bar"
									className="w-full max-w-4 rounded-sm bg-success"
									style={{ height: `${heights[index]!.completed}%` }}
								/>
								<div
									data-testid="run-bars-bar"
									className="w-full max-w-4 rounded-sm bg-danger"
									style={{ height: `${heights[index]!.failed}%` }}
								/>
							</>
						)}
					</div>
					<span className="text-center text-[10px] leading-3 text-muted">{dayLabel(day.dayStart)}</span>
				</div>
			))}
		</div>
	);
}
