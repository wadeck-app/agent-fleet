// TODO: replace by the app-core formatter when published (centralized, user-configurable date/time formatting). This is
// the ONE file of the package that builds a date formatter, so that migration is a swap of this file: keep the exports.
// NoImplicitLocale.test.ts fails when another file formats a date in the language of the browser.

/** A date as the DSL data carries it (ISO 8601 text), or already parsed. */
export type DateInput = string | number | Date;

export interface DateTextOptions {
	/** IANA zone ("UTC", "Asia/Tokyo"). Default: the zone of the machine. Only tests need to set it. */
	timeZone?: string;
}

// Always English and 24 hour clock: the language of the browser decides nothing here (a French browser showed "M M J V S D L").
const LOCALE = 'en-US';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(kind: string, timeZone: string | undefined, fields: Intl.DateTimeFormatOptions) {
	const key = `${kind}|${timeZone ?? ''}`;
	let formatter = formatters.get(key);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat(LOCALE, { hourCycle: 'h23', ...fields, timeZone });
		formatters.set(key, formatter);
	}
	return formatter;
}

function toDate(value: DateInput): Date {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(
			`Cannot format the date ${JSON.stringify(value) ?? 'nothing'}: expected an ISO 8601 time such as 2026-10-24T18:38:07.123Z.`
		);
	}
	return date;
}

function parts(
	kind: string,
	value: DateInput,
	options: DateTextOptions,
	fields: Intl.DateTimeFormatOptions
): Record<string, string> {
	const found: Record<string, string> = {};
	for (const part of formatterFor(kind, options.timeZone, fields).formatToParts(toDate(value))) {
		found[part.type] = part.value;
	}
	return found;
}

const DAY_FIELDS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const MINUTE_FIELDS: Intl.DateTimeFormatOptions = { ...DAY_FIELDS, hour: '2-digit', minute: '2-digit' };
const LONG_FIELDS: Intl.DateTimeFormatOptions = {
	weekday: 'short',
	year: 'numeric',
	...MINUTE_FIELDS,
	second: '2-digit',
};
const CLOCK_FIELDS: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	fractionalSecondDigits: 3,
};

/** "Sat": the 3 letter English weekday. */
export function formatWeekday(value: DateInput, options: DateTextOptions = {}): string {
	return parts('weekday', value, options, { weekday: 'short' })['weekday']!;
}

/** "Oct 24": the day. */
export function formatShort(value: DateInput, options: DateTextOptions = {}): string {
	const found = parts('short', value, options, DAY_FIELDS);
	return `${found['month']} ${found['day']}`;
}

/** "Oct 24, 18:38": the day and the time to the minute. */
export function formatMedium(value: DateInput, options: DateTextOptions = {}): string {
	const found = parts('medium', value, options, MINUTE_FIELDS);
	return `${found['month']} ${found['day']}, ${found['hour']}:${found['minute']}`;
}

/** "Sat, Oct 24, 2026, 18:38:07": everything but the milliseconds. */
export function formatLong(value: DateInput, options: DateTextOptions = {}): string {
	const found = parts('long', value, options, LONG_FIELDS);
	return `${found['weekday']}, ${found['month']} ${found['day']}, ${found['year']}, ${found['hour']}:${found['minute']}:${found['second']}`;
}

/** "18:38:07.123": the time of the day to the millisecond, for a log line. */
export function formatClock(value: DateInput, options: DateTextOptions = {}): string {
	const found = parts('clock', value, options, CLOCK_FIELDS);
	return `${found['hour']}:${found['minute']}:${found['second']}.${found['fractionalSecond']}`;
}

/** "2026-10-24T18:38:07.123Z": the exact instant, the tooltip of every displayed date. */
export function isoTitle(value: DateInput): string {
	return toDate(value).toISOString();
}
