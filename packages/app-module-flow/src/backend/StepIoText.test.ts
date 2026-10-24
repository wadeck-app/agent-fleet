import type { ExecutionState } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { renderStepsIoText } from './StepIoText.js';

function recordOf(steps: ExecutionState['steps']): ExecutionState {
	return {
		executionId: 'e1',
		flowId: 'f',
		status: 'completed',
		startedAt: '2026-08-16T12:00:00.000Z',
		steps,
	} as ExecutionState;
}

const value = (text: string) => ({ text, truncated: false, chars: text.length });

describe('renderStepsIoText', () => {
	it('groups the recorded inputs and outputs under a header line per step', () => {
		const text = renderStepsIoText(
			recordOf({
				build: {
					status: 'completed',
					io: {
						inputs: { branch: value('main') },
						outputs: { sha: value('abc') },
						truncated: false,
						storedChars: 7,
					},
				},
			})
		);
		expect(text).toContain('build (completed)');
		expect(text).toContain('inputs:');
		expect(text).toContain('branch: main');
		expect(text).toContain('sha: abc');
	});

	it('says a step has no recording when its record predates io, without failing', () => {
		const text = renderStepsIoText(recordOf({ old: { status: 'completed' } }));
		expect(text).toContain('old (completed)');
		expect(text).toContain('not recorded for this run');
	});

	it('leaves out the steps that have not started', () => {
		const text = renderStepsIoText(recordOf({ later: { status: 'pending' } }));
		expect(text).not.toContain('later');
	});

	it('says so when no step has anything to show', () => {
		expect(renderStepsIoText(recordOf({ later: { status: 'pending' } }))).toBe('No step has started yet.');
	});
});
