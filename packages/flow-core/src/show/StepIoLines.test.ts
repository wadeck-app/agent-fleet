import { describe, expect, it } from 'vitest';

import type { RecordedValue, StepState } from '../execution/ExecutionState.js';
import { renderStepIoLines } from './StepIoLines.js';

const value = (text: string, truncated = false, chars = text.length): RecordedValue => ({ text, truncated, chars });

const recordedStep = (io: Partial<NonNullable<StepState['io']>>): StepState => ({
	status: 'completed',
	io: { inputs: {}, outputs: {}, truncated: false, storedChars: 0, ...io },
});

describe('renderStepIoLines', () => {
	it('prints each recorded value on one line when it is short and whole', () => {
		const lines = renderStepIoLines(
			recordedStep({ inputs: { 'inputs.task': value('fix it') }, outputs: { plan: value('one') } })
		);

		expect(lines).toEqual(['      inputs:', '        inputs.task: fix it', '      outputs:', '        plan: one']);
	});

	it('indents a multi-line value under its name', () => {
		const lines = renderStepIoLines(recordedStep({ outputs: { log: value('a\nb') } }));

		expect(lines.slice(1)).toEqual(['      outputs:', '        log:', '          a', '          b']);
	});

	it('says how much of a cut value was kept and how long the original was', () => {
		const lines = renderStepIoLines(recordedStep({ outputs: { big: value('abcd', true, 9000) } }));

		expect(lines.join('\n')).toContain('truncated, 4 of 9000 chars kept');
	});

	it('prints stdout and stderr tails of any step, with the same truncation note', () => {
		const lines = renderStepIoLines(recordedStep({ stdout: value('ok'), stderr: value('warn', true, 5000) })).join(
			'\n'
		);

		expect(lines).toContain('stdout:');
		expect(lines).toContain('ok');
		expect(lines).toContain('stderr (truncated, 4 of 5000 chars kept, tail):');
	});

	it('says nothing was recorded, and what to do, for an older record', () => {
		const lines = renderStepIoLines({ status: 'completed' });

		expect(lines).toEqual(['      inputs/outputs: not recorded for this run (record written by an older flow)']);
	});

	it('prints nothing for a step that has not started', () => {
		expect(renderStepIoLines({ status: 'pending' })).toEqual([]);
	});

	it('writes a section that has no value as "(none)"', () => {
		expect(renderStepIoLines(recordedStep({}))).toEqual(['      inputs: (none)', '      outputs: (none)']);
	});
});
