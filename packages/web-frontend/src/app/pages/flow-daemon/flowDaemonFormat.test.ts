import { describe, expect, it } from 'vitest';

import { buildExecutionLogs } from './flowDaemonFixtures';
import {
	ALL_FILTER_VALUE,
	countPages,
	formatCostUsd,
	formatLogEntryLine,
	formatLogStepLabel,
	formatStepCounts,
	formatStepRunner,
	formatTimestamp,
	getExecutionLogNotices,
	getStatusBadgeVariant,
	isFlowExecutionStatus,
	shortenId,
	toStatusFilter,
	toUtcDay,
} from './flowDaemonFormat';

describe('flowDaemonFormat', () => {
	describe('toStatusFilter', () => {
		it('maps the "all" sentinel to no filter', () => {
			expect(toStatusFilter(ALL_FILTER_VALUE)).toBeUndefined();
		});

		it('keeps a known status', () => {
			expect(toStatusFilter('re-queued')).toBe('re-queued');
		});

		it('fails loudly on an unknown status', () => {
			expect(() => toStatusFilter('bogus')).toThrow(/Unknown execution status filter 'bogus'/);
		});
	});

	describe('isFlowExecutionStatus', () => {
		it('accepts the contract statuses only', () => {
			expect(isFlowExecutionStatus('queued')).toBe(true);
			expect(isFlowExecutionStatus('running')).toBe(true);
			expect(isFlowExecutionStatus('completed')).toBe(true);
			expect(isFlowExecutionStatus('failed')).toBe(true);
			expect(isFlowExecutionStatus('re-queued')).toBe(true);
			expect(isFlowExecutionStatus('paused')).toBe(false);
		});
	});

	describe('getStatusBadgeVariant', () => {
		it.each([
			['completed', 'success'],
			['failed', 'destructive'],
			['running', 'info'],
			['queued', 'secondary'],
			['re-queued', 'warning'],
			['pending', 'outline'],
		])('maps %s to %s', (status, variant) => {
			expect(getStatusBadgeVariant(status)).toBe(variant);
		});

		it('throws an actionable error for an unknown status', () => {
			expect(() => getStatusBadgeVariant('something-new')).toThrow(
				/Unknown execution status 'something-new'.*queued.*pending/
			);
		});
	});

	describe('formatTimestamp', () => {
		it('shows a dash for missing values', () => {
			expect(formatTimestamp(null)).toBe('-');
			expect(formatTimestamp(undefined)).toBe('-');
			expect(formatTimestamp('')).toBe('-');
		});

		it('returns the raw value when it is not a date', () => {
			expect(formatTimestamp('not a date')).toBe('not a date');
		});

		it('formats a valid ISO date as UTC date-time', () => {
			expect(formatTimestamp('2026-01-02T03:04:05.000Z')).toBe('2026-01-02 03:04:05');
		});
	});

	describe('formatCostUsd', () => {
		it('formats with 4 decimals', () => {
			expect(formatCostUsd(0.5)).toBe('$0.5000');
		});

		it('shows a dash when the cost is unknown', () => {
			expect(formatCostUsd(undefined)).toBe('-');
		});
	});

	describe('toUtcDay', () => {
		it('uses the UTC day, not the local one', () => {
			expect(toUtcDay(new Date('2026-03-04T23:59:59.000Z'))).toBe('2026-03-04');
			expect(toUtcDay(new Date('2026-03-05T00:00:00.000Z'))).toBe('2026-03-05');
		});
	});

	describe('countPages', () => {
		it('rounds up', () => {
			expect(countPages(41, 20)).toBe(3);
			expect(countPages(40, 20)).toBe(2);
		});

		it('is at least 1 for an empty list', () => {
			expect(countPages(0, 20)).toBe(1);
		});

		it('rejects a non-positive page size', () => {
			expect(() => countPages(10, 0)).toThrow(/Page size must be positive/);
		});
	});

	describe('execution log helpers', () => {
		it('labels the run pseudo step explicitly and leaves other steps alone', () => {
			expect(formatLogStepLabel('__execution')).toBe('Run events (__execution)');
			expect(formatLogStepLabel('compile')).toBe('compile');
		});

		it('formats a log line with the raw timestamp, upper-case level and step', () => {
			const line = formatLogEntryLine({
				timestamp: '2026-05-06T10:00:00.000Z',
				level: 'warning',
				stepId: 'compile',
				message: 'slow',
			});
			expect(line).toBe('2026-05-06T10:00:00.000Z [WARNING] compile: slow');
		});

		it('has no notice for a complete, non-empty list', () => {
			expect(getExecutionLogNotices(buildExecutionLogs({ total: 3 }), false)).toEqual([]);
		});

		it('explains that no log file covers the run, with the directory', () => {
			const notices = getExecutionLogNotices(buildExecutionLogs({ daysRead: [], logsDir: '/logs' }), true);
			expect(notices).toEqual([
				'No daemon log file covers this run: the daemon writes one file per day under /logs and rotates old ones away, or it never logged this run.',
			]);
		});

		it('explains an empty list caused by the filters', () => {
			const notices = getExecutionLogNotices(buildExecutionLogs({ total: 0 }), true);
			expect(notices).toEqual([
				'No log line matches the filters: clear the step, level or text to see the run again.',
			]);
		});

		it('adds no filter notice when nothing is filtered', () => {
			expect(getExecutionLogNotices(buildExecutionLogs({ total: 0 }), false)).toEqual([]);
		});

		it('warns about unreadable lines', () => {
			const notices = getExecutionLogNotices(buildExecutionLogs({ total: 2, unreadableLines: 3 }), false);
			expect(notices).toEqual(['3 line(s) could not be read (damaged log file): this list may be incomplete.']);
		});
	});

	describe('formatStepCounts / formatStepRunner', () => {
		it('formats failed over total', () => {
			expect(formatStepCounts(1, 4)).toBe('1/4');
		});

		it('joins the source and worker that ran a step', () => {
			expect(formatStepRunner('src', 'w1')).toBe('src / w1');
			expect(formatStepRunner(undefined, 'w1')).toBe('w1');
			expect(formatStepRunner('src', undefined)).toBe('src');
			expect(formatStepRunner(undefined, undefined)).toBe('-');
		});

		it('shortens long ids and keeps short ones unchanged', () => {
			expect(shortenId('3f2b9c1e-7a44-4d0b-9e11-0c5d2a8b6f90')).toBe('3f2b9c1e...');
			expect(shortenId('worker-7')).toBe('worker-7');
		});
	});
});
