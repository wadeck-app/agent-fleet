import type { StepPlacement } from 'extension-points';
import { describe, expect, it, vi } from 'vitest';

import type { ReadyStep } from './ReadyStepQueue.js';
import { RequirementOnlyHint } from './RequirementOnlyHint';

const step = (executionId: string, stepId: string): ReadyStep =>
	({ stepId, executionContext: { executionId } }) as unknown as ReadyStep;
const placement = {} as StepPlacement;

const worker = (workerId: string, sourceId: string) => ({ workerId, sourceId });

const build = (workers: Array<{ workerId: string; sourceId: string }>, refused: string[] = []) => {
	const writeExecution = vi.fn();
	const hint = new RequirementOnlyHint(
		{ listConnected: () => workers } as never,
		{
			refusalOf: (_placement: StepPlacement, candidate: { workerId: string }) =>
				refused.includes(candidate.workerId) ? 'no' : undefined,
		},
		{ writeExecution }
	);
	return { hint, writeExecution };
};

const guaranteed = (sourceId: string | undefined): boolean => sourceId === 'sandbox';

describe('RequirementOnlyHint', () => {
	it('warns once per step, naming the requirement-only workers and the fix', () => {
		const { hint, writeExecution } = build([worker('w1', 'sandbox'), worker('w2', 'local')]);
		hint.report(step('e1', 's1'), placement, guaranteed);
		hint.report(step('e1', 's1'), placement, guaranteed);
		expect(writeExecution).toHaveBeenCalledTimes(1);
		const [executionId, message, level] = writeExecution.mock.calls[0]!;
		expect(executionId).toBe('e1');
		expect(level).toBe('warning');
		expect(message).toContain("Step 's1' is not run by the connected worker(s) w1:");
		expect(message).toContain('Add requires: [<guarantee>] or profile: <name>');
		expect(message).not.toContain('w2');
	});

	it('names at most five workers and counts the rest', () => {
		const { hint, writeExecution } = build(Array.from({ length: 7 }, (_, index) => worker(`w${index}`, 'sandbox')));
		hint.report(step('e1', 's1'), placement, guaranteed);
		expect(writeExecution.mock.calls[0]![1]).toContain('w0, w1, w2, w3, w4 and 2 more:');
	});

	it('stays silent when no requirement-only worker would have taken the step', () => {
		const { hint, writeExecution } = build([worker('w1', 'sandbox'), worker('w2', 'local')], ['w1']);
		hint.report(step('e1', 's1'), placement, guaranteed);
		expect(writeExecution).not.toHaveBeenCalled();
	});

	it('reports again after the execution was forgotten, and only for that execution', () => {
		const { hint, writeExecution } = build([worker('w1', 'sandbox')]);
		hint.report(step('e1', 's1'), placement, guaranteed);
		hint.report(step('e2', 's1'), placement, guaranteed);
		hint.forgetExecution('e1');
		hint.report(step('e1', 's1'), placement, guaranteed);
		hint.report(step('e2', 's1'), placement, guaranteed);
		expect(writeExecution).toHaveBeenCalledTimes(3);
	});
});
