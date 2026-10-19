import { describe, expect, it } from 'vitest';

import { ellipsize, excerptOf, startedLabel, statusTag } from './CellText.js';

describe('statusTag', () => {
	it.each([
		['queued', 'wait'],
		['running', 'run'],
		['completed', 'ok'],
		['failed', 'FAIL'],
		['re-queued', 'retry'],
	])('%s -> %s', (status, expected) => {
		expect(statusTag(status)).toBe(expected);
	});

	it('refuses a status it has no tag for instead of printing it bare', () => {
		expect(() => statusTag('exploded')).toThrow(/exploded/);
	});
});

describe('ellipsize', () => {
	it('keeps a text that fits and cuts a longer one to exactly the limit, ending with three dots', () => {
		expect(ellipsize('short', 10)).toBe('short');
		expect(ellipsize('exactly_ten', 11)).toBe('exactly_ten');
		expect(ellipsize('a_really_long_name', 10)).toBe('a_reall...');
	});

	it('rejects a limit too small to hold one character and the dots', () => {
		expect(() => ellipsize('abcdef', 3)).toThrow(/limit/);
	});
});

describe('excerptOf', () => {
	it('flattens line breaks and runs of spaces so a long error reads as one line', () => {
		expect(excerptOf('first line\n   second\tline', 80)).toBe('first line second line');
	});

	it('cuts to the limit', () => {
		expect(excerptOf('x'.repeat(100), 20)).toHaveLength(20);
		expect(excerptOf('x'.repeat(100), 20).endsWith('...')).toBe(true);
	});

	it('is empty for a missing error', () => {
		expect(excerptOf(undefined, 80)).toBe('');
	});
});

describe('startedLabel', () => {
	it('keeps date and minute of the UTC timestamp, like `flow history` without the seconds', () => {
		expect(startedLabel('2026-10-18T16:15:24.166Z')).toBe('2026-10-18 16:15');
	});
});
