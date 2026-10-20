import { describe, expect, it } from 'vitest';

import {
	ellipsize,
	excerptOf,
	outcomeLabel,
	runLabel,
	shortStarted,
	startedLabel,
	statusTag,
	stepStatusTag,
} from './CellText.js';

describe('statusTag', () => {
	it.each([
		['queued', 'waiting'],
		['running', 'running'],
		['completed', 'ok'],
		['failed', 'FAILED'],
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

describe('stepStatusTag', () => {
	it.each([
		['pending', 'pending'],
		['running', 'running'],
		['completed', 'ok'],
		['failed', 'FAILED'],
	])('%s -> %s', (status, expected) => {
		expect(stepStatusTag(status)).toBe(expected);
	});

	it('refuses a step status it has no tag for', () => {
		expect(() => stepStatusTag('exploded')).toThrow(/exploded/);
	});
});

describe('shortStarted', () => {
	it('is "Mon DD HH:MM" in UTC, ASCII only', () => {
		expect(shortStarted('2026-10-18T16:15:24.166Z')).toBe('Oct 18 16:15');
		expect(shortStarted('2026-01-05T03:04:00.000Z')).toBe('Jan 05 03:04');
	});

	it('refuses a timestamp it cannot read instead of printing NaN', () => {
		expect(() => shortStarted('yesterday')).toThrow(/yesterday/);
	});
});

describe('runLabel', () => {
	it('is the flow name and the first 6 characters of the execution id', () => {
		expect(runLabel('build_task', 'rsvl5t4a9')).toBe('build_task rsvl5t');
	});

	it('cuts a long flow name to 20 characters, dots included', () => {
		const label = runLabel('factory_retrospective_v2_long', 'rsvl5t4a');
		expect(label).toBe('factory_retrospec... rsvl5t');
		expect(label.split(' ')[0]).toHaveLength(20);
	});
});

describe('outcomeLabel', () => {
	it('is the bare tag for a plain outcome', () => {
		expect(outcomeLabel('ok', {})).toBe('ok');
	});

	it('says an error was recovered, and how many tries a retried step took', () => {
		expect(outcomeLabel('ok', { recovered: true })).toBe('ok, recovered');
		expect(outcomeLabel('ok', { attempts: 3 })).toBe('ok, 3 tries');
		expect(outcomeLabel('ok', { recovered: true, attempts: 2 })).toBe('ok, recovered, 2 tries');
	});

	it('does not count a single attempt', () => {
		expect(outcomeLabel('FAILED', { attempts: 1 })).toBe('FAILED');
	});
});
