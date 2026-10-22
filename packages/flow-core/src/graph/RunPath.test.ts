import { describe, expect, it } from 'vitest';

import { BUILD_FLOW, COMPLETED_WITH_LOOP, FAILED_AT_TEST, RUNNING_AT_IMPLEMENT } from './RunFixtures.js';
import { computeRunPath, isEdgeTraversed } from './RunPath.js';

describe('computeRunPath', () => {
	it('numbers the steps that started in the order of their start time', () => {
		const path = computeRunPath(BUILD_FLOW, COMPLETED_WITH_LOOP);

		// Only the latest start of each step is recorded, so a step run twice is numbered by its second run.
		expect(['plan', 'implement', 'test', 'ship', 'deploy'].map(id => path[id]!.ordinal)).toEqual([1, 2, 3, 4, 5]);
		expect(path['plan']).toMatchObject({ outcome: 'ran', basis: 'recorded' });
	});

	it('marks a step the scheduler completed without starting as skipped, with its condition as the probable cause', () => {
		const notify = computeRunPath(BUILD_FLOW, COMPLETED_WITH_LOOP)['notify']!;

		expect(notify).toMatchObject({ outcome: 'skipped', basis: 'recorded' });
		expect(notify.ordinal).toBeUndefined();
		expect(notify.reason).toContain('steps.test.outputs.passed');
		expect(notify.reason).toContain('inferred');
	});

	it('says a step after a failed one was not reached, naming the failed dependency', () => {
		const path = computeRunPath(BUILD_FLOW, FAILED_AT_TEST);

		expect(path['ship']).toMatchObject({ outcome: 'not-reached', basis: 'inferred' });
		expect(path['ship']!.reason).toContain("'test' failed");
		// deploy depends on ship, which never ran.
		expect(path['deploy']!.reason).toContain("'ship' did not run");
		expect(path['test']).toMatchObject({ outcome: 'ran', ordinal: 3 });
	});

	it('keeps a pending step waiting while the run is still going', () => {
		const path = computeRunPath(BUILD_FLOW, RUNNING_AT_IMPLEMENT);

		expect(path['implement']).toMatchObject({ outcome: 'running', ordinal: 2 });
		expect(path['test']).toMatchObject({ outcome: 'waiting', basis: 'recorded' });
	});

	it('infers a skip by condition in a failed run when every dependency ran fine', () => {
		const execution = {
			...FAILED_AT_TEST,
			steps: {
				...FAILED_AT_TEST.steps,
				test: { ...FAILED_AT_TEST.steps['test']!, status: 'completed' as const },
			},
		};

		expect(computeRunPath(BUILD_FLOW, execution)['ship']).toMatchObject({ outcome: 'skipped', basis: 'inferred' });
	});

	it('explains the attempts: loop passes, plain re-runs, relaunches after a failed sub-step', () => {
		const path = computeRunPath(BUILD_FLOW, COMPLETED_WITH_LOOP);

		// implement has a retry config AND is the goto target of a loop: the loop is the reason shown.
		expect(path['implement']).toMatchObject({ attempts: 2, attemptKind: 'loop' });
		expect(path['test']).toMatchObject({ attempts: 2, attemptKind: 'loop' });
		// A single start is not worth a mention.
		expect(path['plan']!.attempts).toBeUndefined();
		expect(path['plan']!.attemptKind).toBeUndefined();

		const rerun = {
			...FAILED_AT_TEST,
			steps: { ...FAILED_AT_TEST.steps, plan: { ...FAILED_AT_TEST.steps['plan']!, attempts: 2 } },
		};
		expect(computeRunPath(BUILD_FLOW, rerun)['plan']!.attemptKind).toBe('rerun');
		const relaunched = {
			...FAILED_AT_TEST,
			steps: {
				...FAILED_AT_TEST.steps,
				plan: {
					...FAILED_AT_TEST.steps['plan']!,
					attempts: 2,
					relaunches: [{ at: '2026-08-16T12:00:30.000Z', feedback: 'x' }],
				},
			},
		};
		expect(computeRunPath(BUILD_FLOW, relaunched)['plan']).toMatchObject({
			attemptKind: 'relaunch',
			relaunchCount: 1,
		});
	});

	it('reports a retry when the step has a retry config and no loop', () => {
		const flow = {
			...BUILD_FLOW,
			steps: [{ id: 'a', name: 'A', type: 'script', script: 'x', retry: { maxAttempts: 3, backoff: 'fixed' } }],
		} as unknown as typeof BUILD_FLOW;
		const execution = {
			...FAILED_AT_TEST,
			steps: { a: { status: 'completed' as const, attempts: 2, startedAt: '2026-08-16T12:00:01.000Z' } },
		};

		expect(computeRunPath(flow, execution)['a']).toMatchObject({ attemptKind: 'retry' });
	});

	it('numbers steps the flow file does not declare (injected or removed) like the others', () => {
		const execution = {
			...COMPLETED_WITH_LOOP,
			steps: {
				...COMPLETED_WITH_LOOP.steps,
				extra: {
					status: 'completed' as const,
					injected: true,
					startedAt: '2026-08-16T12:00:30.000Z',
					completedAt: '2026-08-16T12:00:40.000Z',
				},
			},
		};
		const path = computeRunPath(BUILD_FLOW, execution);

		expect(path['extra']).toMatchObject({ outcome: 'ran', ordinal: 2 });
		expect(path['plan']!.ordinal).toBe(1);
	});

	it('treats a resumed step (pending again but with a start) as waiting and keeps its number', () => {
		const execution = {
			...FAILED_AT_TEST,
			status: 'running' as const,
			steps: {
				...FAILED_AT_TEST.steps,
				test: { status: 'pending' as const, attempts: 3, startedAt: '2026-08-16T12:03:10.000Z' },
			},
		};

		expect(computeRunPath(BUILD_FLOW, execution)['test']).toMatchObject({ outcome: 'waiting', ordinal: 3 });
	});

	it('fails with an actionable error on an unreadable start time', () => {
		const execution = {
			...FAILED_AT_TEST,
			steps: { ...FAILED_AT_TEST.steps, plan: { status: 'completed' as const, startedAt: 'yesterday' } },
		};

		expect(() => computeRunPath(BUILD_FLOW, execution)).toThrow(/step 'plan'.*startedAt 'yesterday'/);
	});
});

describe('isEdgeTraversed', () => {
	type Kind = 'dependency' | 'conditional' | 'loop' | 'substep' | 'sequence';
	const edge = (from: string, to: string, kind: Kind) => ({ from, to, kind });

	it('is true when both ends ran and the source finished before the target started', () => {
		expect(isEdgeTraversed(edge('plan', 'implement', 'dependency'), COMPLETED_WITH_LOOP)).toBe(true);
		expect(isEdgeTraversed(edge('test', 'ship', 'conditional'), COMPLETED_WITH_LOOP)).toBe(true);
	});

	it('is false toward a skipped or never started step', () => {
		expect(isEdgeTraversed(edge('test', 'notify', 'conditional'), COMPLETED_WITH_LOOP)).toBe(false);
		expect(isEdgeTraversed(edge('test', 'ship', 'conditional'), FAILED_AT_TEST)).toBe(false);
	});

	it('is false from a source that failed', () => {
		expect(isEdgeTraversed(edge('test', 'ship', 'dependency'), FAILED_AT_TEST)).toBe(false);
	});

	it('takes a loop edge as traversed when its target ran more than once', () => {
		expect(isEdgeTraversed(edge('test', 'implement', 'loop'), COMPLETED_WITH_LOOP)).toBe(true);
		expect(isEdgeTraversed(edge('test', 'implement', 'loop'), FAILED_AT_TEST)).toBe(false);
	});

	it('takes a sub-step link (stored child -> parent) as traversed when the sub-step ran', () => {
		expect(isEdgeTraversed(edge('ship', 'deploy', 'substep'), COMPLETED_WITH_LOOP)).toBe(true);
		expect(isEdgeTraversed(edge('ship', 'deploy', 'substep'), FAILED_AT_TEST)).toBe(false);
	});

	it('takes a recorded-order edge as traversed when both ends ran', () => {
		expect(isEdgeTraversed(edge('plan', 'implement', 'sequence'), FAILED_AT_TEST)).toBe(true);
	});
});
