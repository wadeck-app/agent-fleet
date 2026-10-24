import { describe, expect, it } from 'vitest';

import {
	FOLD_MIN_RUN,
	foldQuietRuns,
	formatSigned,
	formatSpan,
	groupEntries,
	isRunLevel,
	ownerOf,
	spanBar,
	stepColor,
	stepHue,
} from './LogStreamModel.js';
import { type LogStreamEntry, type LogStreamStep } from './LogStreamProps.js';

function entry(stepId: string, overrides: Partial<LogStreamEntry> = {}): LogStreamEntry {
	return {
		timestamp: '2026-10-24T21:36:47.025Z',
		level: 'info',
		stepId,
		preview: `${stepId} line`,
		expandable: false,
		markdown: '',
		subjectStepId: null,
		stepOrder: null,
		stepDepth: 0,
		attempt: 1,
		attempts: 1,
		offsetMs: 0,
		deltaMs: null,
		...overrides,
	};
}

describe('formatSpan', () => {
	it.each([
		[0, '0ms'],
		[312, '312ms'],
		[999.6, '1.0s'],
		[1_000, '1.0s'],
		[12_340, '12.3s'],
		[59_949, '59.9s'],
		[59_950, '1m00s'],
		[65_000, '1m05s'],
		[3_599_000, '59m59s'],
		[3_600_000, '1h00m'],
		[3_723_000, '1h02m'],
	])('writes %d ms as %s', (ms, text) => {
		expect(formatSpan(ms)).toBe(text);
	});

	it('refuses a negative or non finite duration', () => {
		expect(() => formatSpan(-1)).toThrow(/duration/);
		expect(() => formatSpan(Number.NaN)).toThrow(/duration/);
	});
});

describe('formatSigned', () => {
	it('prefixes the span with a plus sign', () => {
		expect(formatSigned(12_340)).toBe('+12.3s');
		expect(formatSigned(0)).toBe('+0ms');
	});
});

describe('stepHue', () => {
	it('gives each of the first steps its own hue between 0 and 359', () => {
		const hues = Array.from({ length: 12 }, (_, i) => stepHue(i + 1));
		expect(new Set(hues).size).toBe(12);
		for (const hue of hues) {
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThan(360);
		}
	});

	it('is stable for an order', () => {
		expect(stepHue(5)).toBe(stepHue(5));
	});

	it('has no hue for a step without order', () => {
		expect(stepHue(null)).toBeNull();
	});
});

describe('spanBar', () => {
	const step = (start: number | null, end: number | null): LogStreamStep => ({
		stepId: 's',
		order: 1,
		depth: 0,
		parentId: null,
		status: 'completed',
		attempts: 1,
		lineCount: 1,
		startOffsetMs: start,
		endOffsetMs: end,
		durationMs: start === null || end === null ? null : end - start,
	});

	it('places the step in percent of the run', () => {
		expect(spanBar(step(25_000, 75_000), 100_000)).toEqual({ left: 25, width: 50 });
	});

	it('keeps a very short step visible', () => {
		expect(spanBar(step(10_000, 10_010), 100_000)?.width).toBe(1);
	});

	it('never leaves the track', () => {
		expect(spanBar(step(99_500, 120_000), 100_000)).toEqual({ left: 99, width: 1 });
	});

	it('has no bar for a step that never started or a run without duration', () => {
		expect(spanBar(step(null, null), 100_000)).toBeNull();
		expect(spanBar(step(0, 10), 0)).toBeNull();
	});
});

describe('groupEntries', () => {
	const lines = [
		entry('__execution'),
		entry('b', { stepOrder: 2, attempt: 1, attempts: 2 }),
		entry('a', { stepOrder: 1, attempt: 1, attempts: 1 }),
		entry('b', { stepOrder: 2, attempt: 2, attempts: 2 }),
		entry('a', { stepOrder: 1, attempt: 1, attempts: 1 }),
		entry('ghost'),
	];

	it('flat keeps one group with the chronological lines', () => {
		const groups = groupEntries(lines, 'flat');
		expect(groups).toHaveLength(1);
		expect(groups[0]!.entries).toBe(lines);
		expect(groups[0]!.key).toBe('all');
	});

	it('step puts run events first, then the steps in execution order, then unknown steps, lines keep their order', () => {
		const groups = groupEntries(lines, 'step');
		expect(groups.map(group => group.key)).toEqual(['step:__execution', 'step:a', 'step:b', 'step:ghost']);
		expect(groups[2]!.entries.map(line => line.attempt)).toEqual([1, 2]);
		expect(groups[1]!.attempt).toBeNull();
	});

	it('attempt splits a step per attempt, in execution order', () => {
		const groups = groupEntries(lines, 'attempt');
		expect(groups.map(group => group.key)).toEqual([
			'attempt:__execution:0',
			'attempt:a:1',
			'attempt:b:1',
			'attempt:b:2',
			'attempt:ghost:1',
		]);
		expect(groups[3]!.attempt).toBe(2);
		expect(groups[3]!.attempts).toBe(2);
	});

	it('counts the problems of each group', () => {
		const groups = groupEntries(
			[
				entry('a', { stepOrder: 1, level: 'error' }),
				entry('a', { stepOrder: 1, level: 'warning' }),
				entry('a', { stepOrder: 1 }),
			],
			'step'
		);
		expect(groups[0]!.errors).toBe(1);
		expect(groups[0]!.warnings).toBe(1);
	});

	it('gives no group for no line', () => {
		expect(groupEntries([], 'step')).toEqual([]);
		expect(groupEntries([], 'flat')).toEqual([]);
	});

	it('refuses an unknown mode', () => {
		expect(() => groupEntries(lines, 'sideways' as never)).toThrow(/Unknown grouping "sideways"/);
	});
});

describe('foldQuietRuns', () => {
	it('folds a run of quiet lines of one step and keeps the others as lines', () => {
		const run = Array.from({ length: FOLD_MIN_RUN }, () => entry('a'));
		const items = foldQuietRuns([entry('a', { level: 'error' }), ...run, entry('a', { level: 'warning' })]);
		expect(items.map(item => item.kind)).toEqual(['line', 'fold', 'line']);
		const fold = items[1]!;
		expect(fold.kind === 'fold' && fold.entries).toHaveLength(FOLD_MIN_RUN);
	});

	it('keeps a short run as lines', () => {
		const items = foldQuietRuns([entry('a'), entry('a')]);
		expect(items.map(item => item.kind)).toEqual(['line', 'line']);
	});

	it('does not merge the quiet lines of two steps', () => {
		const items = foldQuietRuns([
			...Array.from({ length: FOLD_MIN_RUN }, () => entry('a')),
			...Array.from({ length: FOLD_MIN_RUN }, () => entry('b')),
		]);
		expect(items.map(item => item.kind)).toEqual(['fold', 'fold']);
	});

	it('never folds the run events nor a line with a panel', () => {
		const events = Array.from({ length: 5 }, () => entry('__execution'));
		expect(foldQuietRuns(events).every(item => item.kind === 'line')).toBe(true);
		const panels = Array.from({ length: 5 }, () => entry('a', { expandable: true, markdown: 'x' }));
		expect(foldQuietRuns(panels).every(item => item.kind === 'line')).toBe(true);
	});

	it('numbers each line by its place in the list so a panel keeps its identity', () => {
		const items = foldQuietRuns([entry('a'), entry('a', { level: 'error' })]);
		expect(items.map(item => (item.kind === 'line' ? item.index : -1))).toEqual([0, 1]);
	});
});

describe('stepColor', () => {
	it('writes an hsla colour from the hue and the opacity', () => {
		expect(stepColor(120)).toBe('hsla(120, 70%, 48%, 1)');
		expect(stepColor(30, 0.18)).toBe('hsla(30, 70%, 48%, 0.18)');
	});
});

describe('run events about a step', () => {
	const about = (stepId: string, order: number, attempt: number) =>
		entry('__execution', { subjectStepId: stepId, stepOrder: order, attempt, attempts: 2 });

	it('belong to the step they are about', () => {
		expect(ownerOf(about('a', 1, 1))).toBe('a');
		expect(ownerOf(entry('b'))).toBe('b');
		expect(isRunLevel(about('a', 1, 1))).toBe(false);
		expect(isRunLevel(entry('__execution'))).toBe(true);
	});

	it('join the section of their step (or attempt) and leave the run-level events alone', () => {
		const lines = [
			entry('__execution'),
			about('a', 1, 1),
			entry('a', { stepOrder: 1, attempt: 1, attempts: 2 }),
			about('a', 1, 2),
			entry('a', { stepOrder: 1, attempt: 2, attempts: 2 }),
		];
		const byStep = groupEntries(lines, 'step');
		expect(byStep.map(group => [group.key, group.entries.length])).toEqual([
			['step:__execution', 1],
			['step:a', 4],
		]);
		const byAttempt = groupEntries(lines, 'attempt');
		expect(byAttempt.map(group => [group.key, group.entries.length])).toEqual([
			['attempt:__execution:0', 1],
			['attempt:a:1', 2],
			['attempt:a:2', 2],
		]);
	});
});
