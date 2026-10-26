import { filesUnder } from 'flow-core/testing';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// Every date or number the module shows goes through the central formatter of dsl-ui (useDateFormat, DateText, DataTable
// date columns), which carries the user's language, clock, time zone and first day of the week. flow-core text outputs
// (CLI, formatStartedUtc) live in another package and are not covered here.
const FORBIDDEN = [
	/\.toLocale(Date|Time)?String\s*\(/,
	/Intl\.(DateTimeFormat|RelativeTimeFormat|NumberFormat|ListFormat|PluralRules)\s*\(/,
	/navigator\.language/,
];

const shipped = filesUnder(srcDir).filter(
	file => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file) && !/[\\/]testing[\\/]/.test(file)
);

describe('every date is formatted by the central formatter of dsl-ui', () => {
	it('finds the files to check (a wrong directory would make the check below vacuous)', () => {
		expect(shipped.length).toBeGreaterThan(10);
	});

	it.each([
		'new Date(x).toLocaleDateString()',
		'value.toLocaleTimeString("en")',
		'date.toLocaleString()',
		'new Intl.DateTimeFormat("en-US", {})',
		'Intl.RelativeTimeFormat("en")',
		'navigator.language',
	])('the forbidden patterns catch %s', line => {
		expect(FORBIDDEN.some(pattern => pattern.test(line))).toBe(true);
	});

	it.each(shipped.map(file => [relative(srcDir, file).split(sep).join('/'), file]))('%s', (_name, file) => {
		const offending = readFileSync(file as string, 'utf8')
			.split('\n')
			.map((line, index) => ({ line, number: index + 1 }))
			.filter(({ line }) => FORBIDDEN.some(pattern => pattern.test(line)))
			.map(({ line, number }) => `${number}: ${line.trim()}`);
		expect(
			offending,
			'use useDateFormat() (format, exact, intl, weekdays) or the DateText component of @wadeck-app/dsl-ui: the user sets the language, clock and time zone'
		).toEqual([]);
	});
});
