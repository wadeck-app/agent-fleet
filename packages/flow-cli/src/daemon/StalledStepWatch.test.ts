import { describe, expect, it } from 'vitest';

import { StalledStepWatch } from './StalledStepWatch.js';

describe('StalledStepWatch', () => {
	// Why activity and not a socket ping: a worker whose step is wedged has a perfectly responsive
	// event loop, so ws pings answer normally. The jest run that sat in a workspace for 32 hours was
	// exactly that -- a healthy worker holding an assignment that produced nothing.
	it('reports an assignment that has been silent past the limit', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);
		watch.started('a1');

		now += 60_001;

		expect(watch.stalled()).toEqual(['a1']);
	});

	it('says nothing while the limit has not been reached', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);
		watch.started('a1');

		now += 59_999;

		expect(watch.stalled()).toEqual([]);
	});

	// Any traffic for that assignment counts, so a long step that keeps printing is never killed for
	// being slow. Only silence is evidence.
	it('treats activity as progress', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);
		watch.started('a1');

		now += 50_000;
		watch.progressed('a1');
		now += 50_000;

		expect(watch.stalled()).toEqual([]);
	});

	it('forgets an assignment that settled', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);
		watch.started('a1');
		watch.settled('a1');

		now += 60_001;

		expect(watch.stalled()).toEqual([]);
	});

	it('reports each stalled assignment once, so a sweep cannot fail the same step twice', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);
		watch.started('a1');
		now += 60_001;

		expect(watch.stalled()).toEqual(['a1']);
		expect(watch.stalled()).toEqual([]);
	});

	it('watches several assignments independently', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);
		watch.started('old');
		now += 40_000;
		watch.started('recent');
		now += 25_000;

		expect(watch.stalled()).toEqual(['old']);
	});

	it('ignores progress for an assignment it never saw start', () => {
		let now = 1_000;
		const watch = new StalledStepWatch(60_000, () => now);

		watch.progressed('never-issued');
		now += 60_001;

		expect(watch.stalled()).toEqual([]);
	});

	// Disabling it has to be explicit and impossible to reach by accident: a zero or negative limit
	// would silently mean "fail everything at once".
	it('refuses a limit that is not a positive duration', () => {
		expect(() => new StalledStepWatch(0)).toThrow(/positive/i);
		expect(() => new StalledStepWatch(-1)).toThrow(/positive/i);
	});
});
