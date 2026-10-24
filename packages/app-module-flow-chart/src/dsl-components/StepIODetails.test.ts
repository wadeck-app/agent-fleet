import type { FlowGraphNode } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { PREVIEW_CHARS, describeIO, previewOf } from './StepIODetails.js';
import { node } from './testing/GraphFixtures.js';

const NOTES = { inputs: 'inputs not recorded', outputs: 'outputs not recorded' };

function withIO(io: Partial<NonNullable<FlowGraphNode['io']>>): FlowGraphNode {
	return node('test', {
		io: {
			declaredInputs: [],
			declaredOutputs: [],
			recorded: { relaunches: [] },
			usesOutputOf: [],
			usedBy: [],
			notes: NOTES,
			...io,
		},
	});
}

const labelOf = (id: string) => id.toUpperCase();

describe('describeIO', () => {
	it('has nothing to show for a node without io', () => {
		expect(describeIO(node('a'), labelOf)).toBeUndefined();
	});

	it('shows a value when there is one, else the references and the size of a prompt', () => {
		const view = describeIO(
			withIO({
				declaredInputs: [
					{ name: 'env.REGION', value: 'eu', references: [] },
					{ name: 'prompt', references: ['steps.plan.outputs.plan', 'inputs.task'], length: 120 },
					{ name: 'script', references: [], length: 9 },
				],
			}),
			labelOf
		)!;

		expect(view.inputs).toEqual([
			{ name: 'env.REGION', text: 'eu' },
			{ name: 'prompt', text: '120 chars; uses steps.plan.outputs.plan, inputs.task' },
			{ name: 'script', text: '9 chars; no reference' },
		]);
		expect(view.inputsNote).toBe('inputs not recorded');
	});

	it('names the linked steps by label, with the outputs read', () => {
		const view = describeIO(
			withIO({
				usesOutputOf: [{ stepId: 'plan', outputs: ['plan'], fields: ['prompt'] }],
				usedBy: [{ stepId: 'ship', outputs: [], fields: ['session.continue'] }],
			}),
			labelOf
		)!;

		expect(view.usesOutputOf).toEqual([{ stepId: 'plan', label: 'PLAN', detail: 'plan, in prompt' }]);
		expect(view.usedBy).toEqual([{ stepId: 'ship', label: 'SHIP', detail: 'in session.continue' }]);
	});

	it('lists declared outputs and the captured output of a failed step, stderr after stdout', () => {
		const view = describeIO(
			withIO({
				declaredOutputs: [{ name: 'passed', type: 'boolean', source: 'pattern PASS' }],
				recorded: {
					relaunches: [],
					stderr: { text: 'boom', truncated: false, totalChars: 4 },
					stdout: { text: 'out', truncated: true, totalChars: 5000 },
				},
			}),
			labelOf
		)!;

		expect(view.declaredOutputs).toEqual([{ name: 'passed', text: 'boolean, from pattern PASS' }]);
		expect(view.captured.map(c => c.title)).toEqual(['stdout (last 3 of 5000 characters)', 'stderr']);
		expect(view.outputsNote).toBe('outputs not recorded');
	});

	it('lists the run facts that were recorded', () => {
		const view = describeIO(
			withIO({
				recorded: {
					relaunches: [{ at: '2026-08-16T12:00:30.000Z', feedback: 'tests failed' }],
					exitCode: 1,
					sessionId: 'sess-1',
					ttftMs: 900,
					tokens: { input: 10, output: 20, cacheRead: 1, cacheWrite: 2 },
				},
			}),
			labelOf
		)!;

		expect(Object.fromEntries(view.run.map(row => [row.label, row.value]))).toEqual({
			'Exit code': '1',
			Session: 'sess-1',
			'First token': '900 ms',
			Tokens: '10 in, 20 out, 1 cache read, 2 cache write',
		});
		expect(view.relaunches).toEqual([expect.stringContaining('tests failed')]);
	});
});

describe('describeIO with recorded values', () => {
	const value = (text: string, truncated = false, chars = text.length) => ({ text, truncated, chars });

	function recordedStep(kind: 'model' | 'script') {
		return {
			...withIO({
				declaredInputs: [
					{ name: 'env.REGION', value: 'eu', references: [] },
					{ name: 'prompt', references: ['inputs.task'], length: 120 },
					{ name: 'script', references: [], length: 9 },
				],
				declaredOutputs: [
					{ name: 'plan', type: 'string' },
					{ name: 'passed', type: 'boolean' },
				],
				recorded: {
					relaunches: [],
					io: {
						inputs: {
							'env.REGION': value('eu-west'),
							prompt: value('do the task', true, 5000),
							'secrets.TOKEN': value('[secret:TOKEN]'),
						},
						outputs: { plan: value('the plan') },
						stdout: value('answer', true, 9000),
						stderr: value('warn'),
						truncated: true,
						storedChars: 100,
					},
				},
				notes: { inputs: '', outputs: '' },
			}),
			kind,
		};
	}

	it('replaces the declared inputs that were recorded and keeps the others and the undeclared recorded ones', () => {
		const view = describeIO(recordedStep('script'), labelOf)!;

		expect(view.inputs).toEqual([{ name: 'script', text: '9 chars; no reference' }]);
		expect(view.recordedInputs.map(block => block.title)).toEqual(['env.REGION', 'prompt', 'secrets.TOKEN']);
		expect(view.inputsNote).toBe('');
	});

	it('flags a truncated value with the size of the original and the size shown', () => {
		const view = describeIO(recordedStep('script'), labelOf)!;
		const prompt = view.recordedInputs.find(block => block.title === 'prompt')!;

		expect(prompt.capped).toEqual({ text: 'do the task', truncated: true, totalChars: 5000 });
		expect(prompt.note).toBe('truncated, 5000 chars (11 shown)');
		expect(view.recordedInputs[0]!.note).toBeUndefined();
	});

	it('shows recorded outputs, stdout then stderr, and keeps the declared outputs that were not recorded', () => {
		const view = describeIO(recordedStep('script'), labelOf)!;

		expect(view.declaredOutputs.map(o => o.name)).toEqual(['passed']);
		expect(view.recordedOutputs.map(block => block.title)).toEqual(['plan']);
		expect(view.captured.map(block => block.title)).toEqual(['stdout', 'stderr']);
		expect(view.captured[0]!.note).toBe('truncated, 9000 chars (6 shown)');
		expect(view.outputsNote).toBe('');
	});

	it('calls the stdout of a model step its final response', () => {
		const view = describeIO(recordedStep('model'), labelOf)!;

		expect(view.captured.map(block => block.title)).toEqual(['final response', 'stderr']);
	});

	it('keeps the note and shows no recorded block for an older record', () => {
		const view = describeIO(withIO({ declaredInputs: [{ name: 'prompt', references: [], length: 1 }] }), labelOf)!;

		expect(view.recordedInputs).toEqual([]);
		expect(view.recordedOutputs).toEqual([]);
		expect(view.inputs).toHaveLength(1);
		expect(view.inputsNote).toBe('inputs not recorded');
	});
});

describe('previewOf', () => {
	it('shows a short text whole', () => {
		expect(previewOf({ text: 'abc', truncated: false, totalChars: 3 }, false)).toEqual({
			text: 'abc',
			hiddenChars: 0,
		});
	});

	it('shows the beginning of a long text, then all of it once expanded', () => {
		const capped = { text: 'x'.repeat(PREVIEW_CHARS + 50), truncated: false, totalChars: PREVIEW_CHARS + 50 };

		expect(previewOf(capped, false)).toEqual({ text: 'x'.repeat(PREVIEW_CHARS), hiddenChars: 50 });
		expect(previewOf(capped, true)).toEqual({ text: capped.text, hiddenChars: 0 });
	});
});
