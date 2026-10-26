import { Link } from 'react-router-dom';

import { type DateFormatter, useDateFormat } from '@wadeck-app/dsl-ui';

import { RUN_BARS_KEYS, type RunBarsProps, barHeights, barLink, parseRunBarsDays } from './RunBarsProps.js';

function refusal(children: string) {
	return (
		<span role="alert" className="text-xs text-danger-text">
			{children}
		</span>
	);
}

// The link takes the whole height of its half column, so a short bar is easy to hit; the coloured bar inside dims on hover
// and the link shows a ring on keyboard focus.
const LINK_CLASSES =
	'group flex h-full w-full max-w-4 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

const HALF_DAY_MS = 12 * 3600 * 1000;

/** The weekday name of an instant in the style of the user's settings (narrow, short or long), found by its place in the user's week. */
function weekdayLabel(dates: DateFormatter, instant: Date): string {
	const long = dates.intl({ weekday: 'long' }).format(instant);
	const index = dates.weekdays('long').indexOf(long);
	if (index < 0) {
		throw new Error(
			`flow:RunBars cannot name the weekday "${long}" of ${instant.toISOString()} for the locale ${dates.locale}: it is not one of ${dates.weekdays('long').join(', ')}.`
		);
	}
	return dates.weekdays()[index]!;
}

/**
 * The runs of the last days of the dashboard card: one equal column per day over the whole width of the tile, a green bar
 * (completed) and a red bar (failed) in it, the weekday letter under it. A day without run keeps its column and draws a
 * thin baseline, so a quiet week reads as seven days and not as two bars squeezed against the right edge (the dsl-ui Chart
 * draws nothing for a zero). The bars fill the height of the box; hover a day for the date and the counts. A bar is a link
 * to the executions page filtered on its status (the page has no date filter: it lists every run of that status).
 * Each bar is labelled with the weekday of ITS date (the date settings give the language and the style: letter, 3 letters
 * or full name), not by its place in a week that starts on the first day of the user's choice; the exact timestamp of the
 * day start is the tooltip. The days are the server's local days, so the date is read at noon of the day: a user whose time
 * zone differs from the server's by less than 12 hours still sees the right day.
 *
 * Local stand-in for a dsl-ui bar chart that keeps empty categories: when one ships, change `$type: flow:RunBars` in the
 * view and delete this component. Props are closed (days, to): anything else renders an error, so nobody restyles it.
 */
export function RunBars({ days, to, unexpectedKeys }: RunBarsProps) {
	const dates = useDateFormat();
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow:RunBars does not accept ${unexpectedKeys.join(', ')}: its style is fixed. Keep only ${RUN_BARS_KEYS.join(', ')}.`
		);
	}
	let parsed;
	try {
		parsed = parseRunBarsDays(days);
		// Checked before drawing: a bad page is a message, not a bar that leads nowhere.
		barLink(to, 'completed');
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
			role="group"
			aria-label={`Runs of the last ${parsed.length} days: ${completed} completed, ${failed} failed`}
			className="grid h-[4.75rem] w-full gap-1 rounded-md border border-border px-2 pb-1 pt-2"
			style={{ gridTemplateColumns: `repeat(${parsed.length}, minmax(0, 1fr))` }}
		>
			{parsed.map((day, index) => {
				// Noon of the day, so that the zone of the user does not move the date to a neighbouring day.
				const noon = new Date(day.dayStart.getTime() + HALF_DAY_MS);
				const date = `${dates.intl({ weekday: 'short' }).format(noon)} ${dates.format(noon, 'medium', 'date')}`;
				// The days are the local days of the machine that serves the page: the tooltip gives the exact timestamp.
				const dayStartNote = `Day starts ${dates.exact(day.dayStart)} (local midnight of the machine that serves this page).`;
				const bars = [
					{
						status: 'completed',
						count: day.completed,
						height: heights[index]!.completed,
						colour: 'bg-success',
					},
					{ status: 'failed', count: day.failed, height: heights[index]!.failed, colour: 'bg-danger' },
				] as const;
				return (
					<div
						key={day.dayStart.toISOString()}
						data-testid="run-bars-day"
						title={`${date}: ${day.completed} completed, ${day.failed} failed. ${dayStartNote}`}
						className="flex min-h-0 min-w-0 flex-col gap-0.5"
					>
						<div className="relative flex min-h-0 flex-1 items-end justify-center gap-0.5 px-0.5">
							{day.completed === 0 && day.failed === 0 ? (
								<div data-testid="run-bars-baseline" className="h-0.5 w-full rounded-full bg-border" />
							) : (
								bars.map(bar =>
									bar.count === 0 ? (
										// Nothing to open: keeps the column of the other bar, takes no focus.
										<div
											key={bar.status}
											data-testid="run-bars-bar"
											className="w-full max-w-4"
											style={{ height: '0%' }}
										/>
									) : (
										<Link
											key={bar.status}
											to={barLink(to, bar.status)}
											aria-label={`Show the ${bar.status} executions (${bar.count} on ${date})`}
											title={`${date}: ${bar.count} ${bar.status}. ${dayStartNote} Click to list every ${bar.status} execution.`}
											className={LINK_CLASSES}
										>
											<span
												data-testid="run-bars-bar"
												className={`block w-full rounded-sm transition-opacity group-hover:opacity-70 ${bar.colour}`}
												style={{ height: `${bar.height}%` }}
											/>
										</Link>
									)
								)
							)}
						</div>
						<span
							title={dates.exact(day.dayStart)}
							className="truncate text-center text-[11px] leading-3 text-muted"
						>
							{weekdayLabel(dates, noon)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
