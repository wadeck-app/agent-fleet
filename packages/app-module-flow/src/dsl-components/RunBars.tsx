import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { type DateFormatter, useDateFormat } from '@wadeck-app/dsl-ui';

import { type RunBarsDay, bucketRunsByDay } from './RunBarsDays.js';
import {
	RUN_BARS_KEYS,
	type RunBarsProps,
	barHeights,
	barLink,
	parseRunBarsRuns,
	parseRunBarsTruncated,
} from './RunBarsProps.js';

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

type NameStyle = 'narrow' | 'short' | 'long';

// Width of one character of the 11px label, a little above the average so that a wide letter (W, m) still fits.
const LABEL_CHAR_PX = 6.5;
const COLUMN_GAP_PX = 4;

/** The weekday name of an instant in the given style, found by its place in the user's week. */
function weekdayLabel(dates: DateFormatter, instant: Date, style: NameStyle): string {
	const long = dates.intl({ weekday: 'long' }).format(instant);
	const index = dates.weekdays('long').indexOf(long);
	if (index < 0) {
		throw new Error(
			`flow:RunBars cannot name the weekday "${long}" of ${instant.toISOString()} for the locale ${dates.locale}: it is not one of ${dates.weekdays('long').join(', ')}.`
		);
	}
	return dates.weekdays(style)[index]!;
}

/**
 * The style of the visible weekday labels: the user's style, or the widest narrower style that fits the column (long ->
 * short -> narrow), decided on the longest label of the week so that all seven labels share one style. The narrow style is
 * the last resort and is kept even if it does not fit (it then ends with an ellipsis). While the width is unknown (first
 * render, no ResizeObserver) the user's style is kept. Only the visible label is concerned: tooltips and names always carry
 * the full weekday.
 */
function fittingStyle(
	requested: NameStyle,
	columnWidth: number | undefined,
	labels: (style: NameStyle) => string[]
): NameStyle {
	const order: NameStyle[] =
		requested === 'long' ? ['long', 'short', 'narrow'] : requested === 'short' ? ['short', 'narrow'] : ['narrow'];
	if (columnWidth === undefined) {
		return requested;
	}
	for (const style of order) {
		const longest = Math.max(...labels(style).map(label => label.length));
		if (longest * LABEL_CHAR_PX <= columnWidth) {
			return style;
		}
	}
	return 'narrow';
}

/** The content width of the element given to `ref` (a callback ref: the element may appear after the first render); undefined until measured. */
function useContentWidth() {
	const [element, ref] = useState<HTMLDivElement | null>(null);
	const [width, setWidth] = useState<number | undefined>(undefined);
	useEffect(() => {
		if (element === null || typeof ResizeObserver === 'undefined') {
			return;
		}
		const observer = new ResizeObserver(entries => {
			const measured = entries[0]?.contentRect.width;
			if (measured !== undefined && measured > 0) {
				setWidth(measured);
			}
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	return { ref, width };
}

/** The style the user chose, read back from the formatter (it exposes the names, not the setting). */
function requestedStyle(dates: DateFormatter): NameStyle {
	const chosen = dates.weekdays().join('|');
	if (chosen === dates.weekdays('long').join('|')) {
		return 'long';
	}
	return chosen === dates.weekdays('short').join('|') ? 'short' : 'narrow';
}

/**
 * The runs of the last days of the dashboard card: one equal column per day over the whole width of the tile, a green bar
 * (completed) and a red bar (failed) in it, the weekday under it (the user's style; when the full names do not fit the column, the visible label falls back to 3 letters, then to one letter: the tooltips and link names always carry the full weekday). A day without run keeps its column and draws a
 * thin baseline, so a quiet week reads as seven days and not as two bars squeezed against the right edge (the dsl-ui Chart
 * draws nothing for a zero). The bars fill the height of the box; hover a day for the date and the counts. A bar is a link
 * to the executions page filtered on its status (the page has no date filter: it lists every run of that status).
 * Each bar is labelled with the weekday of ITS date (the date settings give the language and the style: letter, 3 letters
 * or full name), not by its place in a week that starts on the first day of the user's choice. The server sends the finished
 * runs of the last 8 days (start time and status only); the days are the calendar days of the time zone of the date
 * settings (`useDateFormat().timeZone`), and each day is read at the noon of that zone. When the source cut the list
 * (`truncated`), a note says that the oldest days may show fewer runs.
 *
 * Local stand-in for a dsl-ui bar chart that keeps empty categories: when one ships, change `$type: flow:RunBars` in the
 * view and delete this component. Props are closed (runs, truncated, to): anything else renders an error, so nobody restyles it.
 */
export function RunBars({ runs, truncated, to, unexpectedKeys }: RunBarsProps) {
	const dates = useDateFormat();
	const { ref, width } = useContentWidth();
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow:RunBars does not accept ${unexpectedKeys.join(', ')}: its style is fixed. Keep only ${RUN_BARS_KEYS.join(', ')}.`
		);
	}
	let parsed: RunBarsDay[];
	let cut: boolean;
	let runCount: number;
	try {
		cut = parseRunBarsTruncated(truncated);
		const finished = parseRunBarsRuns(runs);
		runCount = finished.length;
		parsed = bucketRunsByDay(finished, Date.now(), dates);
		// Checked before drawing: a bad page is a message, not a bar that leads nowhere.
		barLink(to, 'completed');
	} catch (err) {
		return refusal((err as Error).message);
	}
	const heights = barHeights(parsed);
	const columnWidth = width === undefined ? undefined : (width - (parsed.length - 1) * COLUMN_GAP_PX) / parsed.length;
	const labelStyle = fittingStyle(requestedStyle(dates), columnWidth, style =>
		parsed.map(day => weekdayLabel(dates, day.noon, style))
	);
	const completed = parsed.reduce((sum, day) => sum + day.completed, 0);
	const failed = parsed.reduce((sum, day) => sum + day.failed, 0);
	return (
		<>
			<div
				ref={ref}
				role="group"
				aria-label={`Runs of the last ${parsed.length} days: ${completed} completed, ${failed} failed`}
				className="grid h-[4.75rem] w-full gap-1 rounded-md border border-border px-2 pb-1 pt-2"
				style={{ gridTemplateColumns: `repeat(${parsed.length}, minmax(0, 1fr))` }}
			>
				{parsed.map((day, index) => {
					// Noon of the day in the zone of the date settings, so that formatting it gives the day of the bar.
					const noon = day.noon;
					const weekday = dates.intl({ weekday: 'long' }).format(noon);
					const date = `${weekday} ${dates.format(noon, 'medium', 'date')}`;
					// The days are those of the time zone of the date settings, not of the machine that serves the page.
					const dayStartNote = `Days follow the time zone of your date settings (${dates.timeZone}).`;
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
							key={day.date}
							data-testid="run-bars-day"
							title={`${date}: ${day.completed} completed, ${day.failed} failed. ${dayStartNote}`}
							className="flex min-h-0 min-w-0 flex-col gap-0.5"
						>
							<div className="relative flex min-h-0 flex-1 items-end justify-center gap-0.5 px-0.5">
								{day.completed === 0 && day.failed === 0 ? (
									<div
										data-testid="run-bars-baseline"
										className="h-0.5 w-full rounded-full bg-border"
									/>
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
								title={`${weekday}, ${dates.format(noon, 'medium', 'date')} (${dates.timeZone})`}
								className="truncate text-center text-[11px] leading-3 text-muted"
							>
								{weekdayLabel(dates, noon, labelStyle)}
							</span>
						</div>
					);
				})}
			</div>
			{cut ? (
				<p role="status" className="px-1 pt-0.5 text-[11px] leading-3 text-muted">
					Only the newest {runCount} runs are counted: the oldest days may show fewer.
				</p>
			) : null}
		</>
	);
}
