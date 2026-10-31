import type { DateFormatter } from '@wadeck-app/dsl-ui';

/** A finished run, as the bars count it. */
export interface RunBarsRun {
	startedAt: Date;
	status: 'completed' | 'failed';
}

/** One bar column: a calendar day of the viewer's time zone and the runs that started in it. */
export interface RunBarsDay {
	/** `YYYY-MM-DD`, the calendar day in the time zone. */
	date: string;
	/** An instant at 12:00 of that day in the time zone: formatting it in that zone gives the day, whatever the offset. */
	noon: Date;
	completed: number;
	failed: number;
}

/** Days drawn by the bars. */
export const RUN_BARS_DAYS = 7;

interface CalendarDate {
	year: number;
	month: number;
	day: number;
}

function key({ year, month, day }: CalendarDate): string {
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type Clock = (instant: number) => CalendarDate & { hour: number; minute: number };

/**
 * Wall clock of an instant in the time zone of the user's formatter. Latin digits and the Gregorian calendar are asked for
 * explicitly: the user's language may write other digits or use another calendar (Thai years, for example), and the day
 * keys must not depend on it.
 */
function clockOf(dates: DateFormatter): Clock {
	const formatter = dates.intl({
		numberingSystem: 'latn',
		calendar: 'gregory',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23',
	});
	return instant => {
		const parts = formatter.formatToParts(instant);
		const part = (type: Intl.DateTimeFormatPartTypes): number =>
			Number(parts.find(candidate => candidate.type === type)?.value);
		return {
			year: part('year'),
			month: part('month'),
			day: part('day'),
			hour: part('hour'),
			minute: part('minute'),
		};
	};
}

/** The instant at 12:00 on a calendar day in the zone (noon: far from the night-time clock changes). */
function noonOf(date: CalendarDate, clock: Clock, timeZone: string): Date {
	const utcNoon = Date.UTC(date.year, date.month - 1, date.day, 12);
	const wall = clock(utcNoon);
	const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
	const noon = new Date(utcNoon - (wallAsUtc - utcNoon));
	if (key(clock(noon.getTime())) !== key(date)) {
		throw new Error(`flow:RunBars cannot place noon of ${key(date)} in the time zone "${timeZone}".`);
	}
	return noon;
}

/**
 * The last {@link RUN_BARS_DAYS} calendar days of the time zone, ending with the day of `now`, oldest first, with the runs
 * counted on the day they started in that zone (not the server's). Runs before the first day or after `now` are ignored.
 */
export function bucketRunsByDay(runs: readonly RunBarsRun[], now: number, dates: DateFormatter): RunBarsDay[] {
	const clock = clockOf(dates);
	const today = clock(now);
	const days = Array.from({ length: RUN_BARS_DAYS }, (_, index): RunBarsDay => {
		// Calendar arithmetic on the date alone (UTC fields), never "24 hours earlier": a day with a clock change is not 24 hours long.
		const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day - (RUN_BARS_DAYS - 1 - index)));
		const date = { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
		return { date: key(date), noon: noonOf(date, clock, dates.timeZone), completed: 0, failed: 0 };
	});
	const byDate = new Map(days.map(day => [day.date, day]));
	for (const run of runs) {
		if (run.startedAt.getTime() > now) {
			continue;
		}
		const day = byDate.get(key(clock(run.startedAt.getTime())));
		if (day === undefined) {
			continue;
		}
		if (run.status === 'completed') {
			day.completed += 1;
		} else {
			day.failed += 1;
		}
	}
	return days;
}
