import { describe, expect, it } from 'vitest';

import { SchedulerIdleState } from './SchedulerIdleState.js';

function idleState(
	state: { queued?: number; active?: number; activeIds?: string[]; resumable?: number; pendingRunEnds?: boolean } = {}
) {
	return new SchedulerIdleState(
		{ length: state.queued ?? 0 },
		{
			activeExecutionCount: () => state.active ?? 0,
			isActive: (executionId: string) => (state.activeIds ?? []).includes(executionId),
			resumableCount: () => state.resumable ?? 0,
		},
		{ hasPending: () => state.pendingRunEnds ?? false }
	);
}

describe('SchedulerIdleState', () => {
	it('reports nothing held when everything is empty', () => {
		const state = idleState();

		expect(state.isQueueEmpty()).toBe(true);
		expect(state.hasActiveExecutions()).toBe(false);
		expect(state.hasResumableInterventions()).toBe(false);
		expect(state.hasPendingRunEnds()).toBe(false);
	});

	it('reports each condition on its own', () => {
		expect(idleState({ queued: 1 }).isQueueEmpty()).toBe(false);
		expect(idleState({ active: 2 }).hasActiveExecutions()).toBe(true);
		expect(idleState({ resumable: 1 }).hasResumableInterventions()).toBe(true);
		expect(idleState({ pendingRunEnds: true }).hasPendingRunEnds()).toBe(true);
	});

	it('does not let a kept-alive execution count as an active one', () => {
		const state = idleState({ active: 0, resumable: 1 });

		expect(state.hasActiveExecutions()).toBe(false);
		expect(state.hasResumableInterventions()).toBe(true);
	});

	it('knows which executions the scheduler still holds', () => {
		const state = idleState({ activeIds: ['e1'] });

		expect(state.isExecutionActive('e1')).toBe(true);
		expect(state.isExecutionActive('e2')).toBe(false);
	});

	it('describes everything the idle check consults on one line', () => {
		expect(idleState({ queued: 3, active: 2, resumable: 1, pendingRunEnds: true }).describe()).toBe(
			'queue=3 activeExecutions=2 resumableInterventions=1 pendingRunEnds=1+'
		);
		expect(idleState().describe()).toBe('queue=0 activeExecutions=0 resumableInterventions=0 pendingRunEnds=0');
	});
});
