import type { ExecutionRecord } from '../execution/ExecutionRecord.js';

/** Test fixture builder: a complete, valid completed execution with the given overrides. */
export function makeExec(partial: Partial<ExecutionRecord> & { executionId: string }): ExecutionRecord {
	return {
		flowId: 'test-flow',
		flowFile: '/tmp/test-flow.yml',
		status: 'completed',
		currentSteps: [],
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:00:01.000Z',
		steps: {},
		...partial,
	};
}
