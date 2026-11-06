import { describe, expect, it } from 'vitest';

import { SourceContactErrors } from './SourceContactErrors.js';
import type { WorkerTypeLookup } from './WorkerTypeCatalog.js';

const at = (hh: number, mm: number, ss: number): number => Date.UTC(2026, 10, 6, hh, mm, ss);
const typeOf: WorkerTypeLookup = sourceId =>
	({ 'sbx-1': 'sandbox', 'sbx-2': 'sandbox', 'gpu-1': 'gpu' })[sourceId ?? ''];

function store(logsDir: string | undefined = 'C:/logs') {
	const clock = { now: at(17, 0, 0) };
	return { clock, errors: new SourceContactErrors(logsDir, () => clock.now) };
}

describe('SourceContactErrors - metadata only', () => {
	it('says when the latest contact failed, how many times in a row since when, and where the error is', () => {
		const { clock, errors } = store();
		clock.now = at(17, 1, 20);
		errors.failed('sbx-1');
		clock.now = at(17, 1, 50);
		errors.failed('sbx-1');
		clock.now = at(17, 2, 11);
		errors.failed('sbx-1');

		expect(errors.since('sandbox', typeOf, 0)).toEqual([
			'Last contact with source "sbx-1" failed at 2026-11-06T17:02:11Z (3 consecutive failures since 17:01:20Z); the error is in the daemon log (flow logs, or C:/logs).',
		]);
	});

	it('leaves out the streak for a single failure', () => {
		const { clock, errors } = store();
		clock.now = at(17, 2, 11);
		errors.failed('sbx-1');

		expect(errors.since('sandbox', typeOf, 0)).toEqual([
			'Last contact with source "sbx-1" failed at 2026-11-06T17:02:11Z; the error is in the daemon log (flow logs, or C:/logs).',
		]);
	});

	it('says only "flow logs" when the logs directory is not known', () => {
		const clock = { now: at(17, 0, 0) };
		const errors = new SourceContactErrors(undefined, () => clock.now);
		clock.now = at(17, 2, 11);
		errors.failed('sbx-1');

		expect(errors.since('sandbox', typeOf, 0)).toEqual([
			'Last contact with source "sbx-1" failed at 2026-11-06T17:02:11Z; the error is in the daemon log (flow logs).',
		]);
	});

	it('counts the failures in a row up and keeps when the first of them happened', () => {
		const { clock, errors } = store();
		clock.now = at(17, 1, 0);
		errors.failed('sbx-1');
		clock.now = at(17, 5, 0);
		errors.failed('sbx-1');

		expect(errors.since('sandbox', typeOf, 0)[0]).toContain('(2 consecutive failures since 17:01:00Z)');
		expect(errors.since('sandbox', typeOf, 0)[0]).toContain('failed at 2026-11-06T17:05:00Z');
	});

	it('starts the count again after a success', () => {
		const { clock, errors } = store();
		clock.now = at(17, 1, 0);
		errors.failed('sbx-1');
		errors.failed('sbx-1');

		errors.succeeded('sbx-1');
		expect(errors.since('sandbox', typeOf, 0)).toEqual([]);

		clock.now = at(17, 9, 0);
		errors.failed('sbx-1');
		expect(errors.since('sandbox', typeOf, 0)[0]).not.toContain('consecutive');
		expect(errors.since('sandbox', typeOf, 0)[0]).toContain('failed at 2026-11-06T17:09:00Z');
	});

	it('excludes a failure older than the start of the wait, and includes one at that very time', () => {
		const { clock, errors } = store();
		clock.now = at(17, 1, 0);
		errors.failed('sbx-1');

		expect(errors.since('sandbox', typeOf, at(17, 1, 1))).toEqual([]);
		expect(errors.since('sandbox', typeOf, at(17, 1, 0))).toHaveLength(1);
	});

	it('excludes the failures of sources of another type, or of no type', () => {
		const { clock, errors } = store();
		clock.now = at(17, 2, 0);
		errors.failed('gpu-1');
		errors.failed('stray');

		expect(errors.since('sandbox', typeOf, 0)).toEqual([]);
	});

	it('lists every source of the type, each with its own streak', () => {
		const { clock, errors } = store();
		clock.now = at(17, 2, 0);
		errors.failed('sbx-1');
		errors.failed('sbx-2');
		errors.failed('sbx-2');

		const sentences = errors.since('sandbox', typeOf, 0);
		expect(sentences).toHaveLength(2);
		expect(sentences[0]).toContain('"sbx-1"');
		expect(sentences[1]).toContain('"sbx-2"');
		expect(sentences[1]).toContain('2 consecutive failures');
	});

	it('forgets the sources that are no longer declared', () => {
		const { clock, errors } = store();
		clock.now = at(17, 2, 0);
		errors.failed('sbx-1');
		errors.failed('sbx-2');

		errors.retainOnly(['sbx-1']);

		expect(errors.since('sandbox', typeOf, 0)).toHaveLength(1);
		expect(errors.since('sandbox', typeOf, 0)[0]).toContain('"sbx-1"');
	});

	it('hands a bound-step wait the same sentences through sinceFor', () => {
		const { clock, errors } = store();
		clock.now = at(17, 2, 0);
		errors.failed('sbx-1');

		expect(errors.sinceFor('sandbox', typeOf)(0)).toEqual(errors.since('sandbox', typeOf, 0));
	});
});
