import type { LogRecordStep } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { type LogTimelineInput, buildLogTimeline } from './LogTimeline.js';

const T = (seconds: number): string => new Date(Date.UTC(2026, 9, 18, 10, 0, seconds)).toISOString();
const NOW = Date.UTC(2026, 9, 18, 10, 5, 0);

const entry = (stepId: string, seconds: number, message = 'm') => ({
	timestamp: T(seconds),
	level: 'info',
	stepId,
	message,
});

function input(overrides: Partial<LogTimelineInput<ReturnType<typeof entry>>> = {}) {
	return {
		runStartedAt: T(0),
		runCompletedAt: T(60),
		now: NOW,
		recordSteps: [] as LogRecordStep[],
		attemptStarts: {},
		stepLineCounts: {},
		entries: [] as ReturnType<typeof entry>[],
		...overrides,
	};
}

describe('buildLogTimeline entries', () => {
	const recordSteps: LogRecordStep[] = [
		{ stepId: 'late', status: 'completed', startedAt: T(20), completedAt: T(30) },
		{ stepId: 'early', status: 'failed', startedAt: T(5), completedAt: T(15), attempts: 2 },
	];

	it('adds order, depth, attempt, attempts, offset and delta', () => {
		const { entries } = buildLogTimeline(
			input({
				recordSteps,
				attemptStarts: { early: [T(5), T(10)] },
				entries: [
					entry('__execution', 5, 'Step early started executing'),
					entry('early', 6),
					entry('early', 12),
					entry('late', 21),
				],
			})
		);
		expect(entries.map(e => [e.stepOrder, e.stepDepth, e.attempt, e.attempts, e.offsetMs, e.deltaMs])).toEqual([
			[1, 0, 1, 2, 5000, null],
			[1, 0, 1, 2, 6000, 1000],
			[1, 0, 2, 2, 12000, 6000],
			[2, 0, 0, 0, 21000, 9000],
		]);
		expect(entries[1]).toMatchObject({ stepId: 'early', message: 'm', level: 'info' });
	});

	it('attributes the run events about a step ("Step <id> started executing|completed|failed|not run") to that step, attempt included', () => {
		const { entries } = buildLogTimeline(
			input({
				recordSteps,
				attemptStarts: { early: [T(5), T(10)] },
				entries: [
					entry('__execution', 1, 'Execution started for flow x'),
					entry('__execution', 5, 'Step early started executing'),
					entry('__execution', 9, 'Step early failed: boom'),
					entry('__execution', 10, 'Step early started executing'),
					entry('__execution', 16, 'Step late not run: its parent was not run'),
					entry('__execution', 17, 'Step ghost completed'),
				],
			})
		);
		expect(entries.map(e => [e.stepId, e.subjectStepId, e.stepOrder, e.attempt, e.attempts])).toEqual([
			['__execution', null, null, 0, 0],
			['__execution', 'early', 1, 1, 2],
			['__execution', 'early', 1, 1, 2],
			['__execution', 'early', 1, 2, 2],
			['__execution', 'late', 2, 0, 0],
			// A step the record does not know is not claimed.
			['__execution', null, null, 0, 0],
		]);
	});

	it('has no subject for the lines of a step', () => {
		const { entries } = buildLogTimeline(
			input({ recordSteps, entries: [entry('early', 6, 'Step late completed')] })
		);
		expect(entries[0]!.subjectStepId).toBeNull();
	});

	it('gives no order to a step the record does not know, and clamps a line before the run start to offset 0', () => {
		const { entries } = buildLogTimeline(input({ entries: [entry('ghost', -3)] }));
		expect(entries[0]).toMatchObject({ stepOrder: null, stepDepth: 0, offsetMs: 0, deltaMs: null });
	});

	it('keeps the extra fields of the entries', () => {
		const withExtra = { ...entry('a', 1), preview: 'p' };
		const { entries } = buildLogTimeline({ ...input(), entries: [withExtra] });
		expect(entries[0]).toMatchObject({ preview: 'p' });
	});
});

describe('buildLogTimeline steps', () => {
	it('lists run events first, then the tree in execution order, then unstarted steps, then unknown steps', () => {
		const recordSteps: LogRecordStep[] = [
			{ stepId: 'never', status: 'pending' },
			{ stepId: 'second', status: 'running', startedAt: T(20) },
			{ stepId: 'sub-b', status: 'completed', startedAt: T(30), completedAt: T(35), parent: 'first' },
			{ stepId: 'first', status: 'completed', startedAt: T(10), completedAt: T(18), attempts: 1 },
			{ stepId: 'sub-a', status: 'completed', startedAt: T(25), completedAt: T(28), parent: 'first' },
			{ stepId: 'deep', status: 'completed', startedAt: T(26), completedAt: T(27), parent: 'sub-a' },
		];
		const { steps, runDurationMs } = buildLogTimeline(
			input({
				recordSteps,
				attemptStarts: { first: [T(10), T(12)], ghost: [T(40)] },
				stepLineCounts: { __execution: 4, first: 3, ghost: 1 },
				entries: [],
			})
		);
		expect(runDurationMs).toBe(60000);
		expect(steps.map(s => [s.stepId, s.order, s.depth, s.parentId])).toEqual([
			['__execution', null, 0, null],
			['first', 1, 0, null],
			['sub-a', 3, 1, 'first'],
			['deep', 4, 2, 'sub-a'],
			['sub-b', 5, 1, 'first'],
			['second', 2, 0, null],
			['never', null, 0, null],
			['ghost', null, 0, null],
		]);
		expect(steps[0]).toMatchObject({
			label: 'Run events',
			status: 'completed',
			lineCount: 4,
			startOffsetMs: 0,
			endOffsetMs: 60000,
			durationMs: 60000,
		});
		expect(steps[1]).toMatchObject({
			attempts: 2,
			lineCount: 3,
			startOffsetMs: 10000,
			endOffsetMs: 18000,
			durationMs: 8000,
		});
		expect(steps[6]).toMatchObject({
			status: 'pending',
			lineCount: 0,
			startOffsetMs: null,
			endOffsetMs: null,
			durationMs: null,
		});
		expect(steps[7]).toMatchObject({ status: 'unknown', attempts: 1, lineCount: 1, startOffsetMs: null });
	});

	it('ends a running step and a running run at the clock, and uses the record attempts when larger', () => {
		const { steps, runDurationMs } = buildLogTimeline(
			input({
				runCompletedAt: null,
				recordSteps: [{ stepId: 'a', status: 'running', startedAt: T(10), attempts: 3 }],
				attemptStarts: { a: [T(10)] },
				entries: [entry('__execution', 10)],
			})
		);
		expect(runDurationMs).toBe(300000);
		expect(steps[0]).toMatchObject({ stepId: '__execution', status: 'running', endOffsetMs: 300000 });
		expect(steps[1]).toMatchObject({ attempts: 3, startOffsetMs: 10000, endOffsetMs: 300000, durationMs: 290000 });
	});

	it('has no run events row without run event lines', () => {
		const { steps } = buildLogTimeline(input({ recordSteps: [{ stepId: 'a', status: 'pending' }] }));
		expect(steps.map(s => s.stepId)).toEqual(['a']);
	});

	it('breaks ties of the start time by record order', () => {
		const { steps } = buildLogTimeline(
			input({
				recordSteps: [
					{ stepId: 'x', status: 'completed', startedAt: T(5) },
					{ stepId: 'y', status: 'completed', startedAt: T(5) },
				],
			})
		);
		expect(steps.map(s => [s.stepId, s.order])).toEqual([
			['x', 1],
			['y', 2],
		]);
	});

	it('leaves the end open for a step that started and never completed', () => {
		const { steps } = buildLogTimeline(
			input({ recordSteps: [{ stepId: 'a', status: 'failed', startedAt: T(5) }] })
		);
		expect(steps[0]).toMatchObject({ startOffsetMs: 5000, endOffsetMs: null, durationMs: null });
	});
});

describe('buildLogTimeline failures', () => {
	it('names a parent that is not a recorded step', () => {
		expect(() =>
			buildLogTimeline(input({ recordSteps: [{ stepId: 'kid', status: 'pending', parent: 'nobody' }] }))
		).toThrow(/step 'kid' has parent 'nobody'/);
	});

	it('names a parent cycle', () => {
		expect(() =>
			buildLogTimeline(
				input({
					recordSteps: [
						{ stepId: 'a', status: 'pending', parent: 'b' },
						{ stepId: 'b', status: 'pending', parent: 'a' },
					],
				})
			)
		).toThrow(/parent chain of step 'a' loops/);
	});

	it.each([
		['the run start', { runStartedAt: 'x1' }, /x1/],
		['the run end', { runCompletedAt: 'x2' }, /x2/],
		[
			'a step start',
			{ recordSteps: [{ stepId: 's', status: 'running' as const, startedAt: 'x3' }] },
			/step 's'.*x3/,
		],
		['a line', { entries: [{ ...entry('s', 1), timestamp: 'x4' }] }, /'s' log line 'x4'/],
	])('rejects an unreadable timestamp of %s', (_name, overrides, pattern) => {
		expect(() => buildLogTimeline(input(overrides))).toThrow(pattern);
	});

	it('rejects an unreadable step completion time', () => {
		expect(() =>
			buildLogTimeline(
				input({ recordSteps: [{ stepId: 's', status: 'completed', startedAt: T(1), completedAt: 'x5' }] })
			)
		).toThrow(/completedAt of step 's'/);
	});
});
