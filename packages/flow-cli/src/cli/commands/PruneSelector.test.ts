import type { ExecutionState } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { PruneSelector } from './PruneSelector';

function record(id: string, flowId: string, status: string, startedAt: string, extra: object = {}): ExecutionState {
	return {
		executionId: id,
		flowId,
		status,
		startedAt,
		steps: {},
		currentSteps: [],
		...extra,
	} as unknown as ExecutionState;
}

const RECORDS = [
	record('aaaaaaa1', 'probe', 'completed', '2026-10-01T10:00:00.000Z', { projectId: 'p1' }),
	record('aaaaaaa2', 'probe', 'failed', '2026-11-01T10:00:00.000Z', { projectId: 'p2' }),
	record('aaaaaaa3', 'real', 'completed', '2026-09-01T10:00:00.000Z', { projectId: 'p1', lastError: 'x' }),
	record('aaaaaaa4', 'other', 'failed', '2026-08-01T10:00:00.000Z'),
	record('aaaaaaa5', 'probe', 'running', '2026-07-01T10:00:00.000Z'),
];

const ids = (records: ExecutionState[]): string[] => records.map(r => r.executionId).sort();

describe('PruneSelector', () => {
	it('hasFilter is false only when no criterion is given', () => {
		expect(PruneSelector.hasFilter({ flows: [] })).toBe(false);
		expect(PruneSelector.hasFilter({ flows: ['a'] })).toBe(true);
		expect(PruneSelector.hasFilter({ flows: [], projectId: 'p' })).toBe(true);
		expect(PruneSelector.hasFilter({ flows: [], status: 'failed' })).toBe(true);
		expect(PruneSelector.hasFilter({ flows: [], beforeMs: 0 })).toBe(true);
	});

	it('selects by one flow, and by several flows', () => {
		expect(ids(PruneSelector.select(RECORDS, { flows: ['real'] }).deletable)).toEqual(['aaaaaaa3']);
		expect(ids(PruneSelector.select(RECORDS, { flows: ['real', 'other'] }).deletable)).toEqual([
			'aaaaaaa3',
			'aaaaaaa4',
		]);
	});

	it('selects by project and by status (including recovered)', () => {
		expect(ids(PruneSelector.select(RECORDS, { flows: [], projectId: 'p1' }).deletable)).toEqual([
			'aaaaaaa1',
			'aaaaaaa3',
		]);
		expect(ids(PruneSelector.select(RECORDS, { flows: [], status: 'failed' }).deletable)).toEqual([
			'aaaaaaa2',
			'aaaaaaa4',
		]);
		expect(ids(PruneSelector.select(RECORDS, { flows: [], status: 'recovered' }).deletable)).toEqual(['aaaaaaa3']);
	});

	it('--before is strict: a run started exactly at the bound is kept', () => {
		const bound = Date.parse('2026-10-01T10:00:00.000Z');
		const selected = PruneSelector.select(RECORDS, { flows: [], beforeMs: bound });
		expect(ids(selected.deletable)).toEqual(['aaaaaaa3', 'aaaaaaa4']);
	});

	it('a record with an unreadable start time never matches --before', () => {
		const broken = record('bbbbbbb1', 'probe', 'completed', 'not a date');
		expect(PruneSelector.select([broken], { flows: [], beforeMs: Date.now() }).deletable).toEqual([]);
	});

	it('combines the criteria with AND', () => {
		const selected = PruneSelector.select(RECORDS, { flows: ['probe'], status: 'failed', projectId: 'p2' });
		expect(ids(selected.deletable)).toEqual(['aaaaaaa2']);
	});

	it('refuses running, queued and re-queued runs with an actionable reason', () => {
		const runs = ['running', 'queued', 're-queued'].map((status, i) =>
			record(`ccccccc${i}`, 'probe', status, '2026-01-01T00:00:00Z')
		);
		const selected = PruneSelector.select(runs, { flows: ['probe'] });
		expect(selected.deletable).toEqual([]);
		expect(selected.refused).toHaveLength(3);
		expect(selected.refused[0]!.reason).toContain('flow cancel');
	});

	it('refuses a paused run whatever its status', () => {
		const paused = record('ddddddd1', 'probe', 'running', '2026-01-01T00:00:00Z', { paused: { since: 'x' } });
		const selected = PruneSelector.select([paused], { flows: ['probe'] });
		expect(selected.refused).toEqual([{ executionId: 'ddddddd1', reason: expect.stringContaining('paused') }]);
		expect(PruneSelector.select([paused], { flows: [], status: 'paused' }).refused).toHaveLength(1);
	});

	it('refuses an unknown status (fail closed)', () => {
		const odd = record('eeeeeee1', 'probe', 'weird', '2026-01-01T00:00:00Z');
		expect(PruneSelector.select([odd], { flows: ['probe'] }).refused[0]!.reason).toContain(
			'unknown status "weird"'
		);
	});

	it('validates --status values and detects an unfinished-only request', () => {
		expect(() => PruneSelector.assertKnownStatus('failed')).not.toThrow();
		expect(() => PruneSelector.assertKnownStatus('cancelled')).toThrow(/Invalid --status "cancelled"/);
		expect(PruneSelector.asksForUnfinished('running')).toBe(true);
		expect(PruneSelector.asksForUnfinished('paused')).toBe(true);
		expect(PruneSelector.asksForUnfinished('failed')).toBe(false);
		expect(PruneSelector.asksForUnfinished(undefined)).toBe(false);
	});
});
