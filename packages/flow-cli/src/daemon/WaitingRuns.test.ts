import { WaitingRuns } from './WaitingRuns';

describe('WaitingRuns', () => {
	it('counts the runs that wait and forgets those that stopped', () => {
		const runs = new WaitingRuns();
		runs.add('aaaa1111', () => undefined);
		runs.add('bbbb2222', () => undefined);

		expect(runs.count()).toBe(2);
		expect(runs.has('aaaa1111')).toBe(true);

		runs.remove('aaaa1111');

		expect(runs.count()).toBe(1);
		expect(runs.has('aaaa1111')).toBe(false);
	});

	it('cancel() stops the wait of that run only and tells whether it waited', () => {
		const first = vi.fn();
		const second = vi.fn();
		const runs = new WaitingRuns();
		runs.add('aaaa1111', first);
		runs.add('bbbb2222', second);

		expect(runs.cancel('aaaa1111')).toBe(true);
		expect(runs.cancel('cccc3333')).toBe(false);

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});
});
