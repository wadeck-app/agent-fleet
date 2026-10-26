import { filesUnder } from 'flow-core/testing';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// The one file allowed to build a formatter: every date the module shows goes through it.
const ALLOWED = ['commons/DateText.ts'];
const FORBIDDEN = [
	/\.toLocale(Date|Time)?String\s*\(/,
	/Intl\.(DateTimeFormat|RelativeTimeFormat|NumberFormat|ListFormat|PluralRules)\s*\(/,
	/navigator\.language/,
];

const shipped = filesUnder(srcDir).filter(
	file => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file) && !/[\\/]testing[\\/]/.test(file)
);

describe('no date or number is formatted in the language of the browser', () => {
	it('finds the files to check (a wrong directory would make the check below vacuous)', () => {
		expect(shipped.length).toBeGreaterThan(10);
	});

	it.each(shipped.map(file => [relative(srcDir, file).split(sep).join('/'), file]))('%s', (name, file) => {
		if (ALLOWED.includes(name as string)) return;
		const offending = readFileSync(file as string, 'utf8')
			.split('\n')
			.map((line, index) => ({ line, number: index + 1 }))
			.filter(({ line }) => FORBIDDEN.some(pattern => pattern.test(line)))
			.map(({ line, number }) => `${number}: ${line.trim()}`);
		expect(offending, 'use DateText (formatMedium, formatWeekday, ...): one explicit English presentation').toEqual(
			[]
		);
	});
});
