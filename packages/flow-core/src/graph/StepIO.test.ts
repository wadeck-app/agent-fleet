import type { FlowStep } from 'flow-engine/types';
import { describe, expect, it } from 'vitest';

import { BUILD_FLOW, COMPLETED_WITH_LOOP, FAILED_AT_TEST } from './RunFixtures.js';
import { MAX_CAPPED_CHARS, capText, describeStepIO, findDataLinks, referencedInputNames } from './StepIO.js';

const step = (id: string): FlowStep => BUILD_FLOW.steps.find(s => s.id === id)!;

describe('capText', () => {
	it('keeps short text as is', () => {
		expect(capText('abc')).toEqual({ text: 'abc', truncated: false, totalChars: 3 });
	});

	it('keeps the tail of a long text and says how long it was', () => {
		const capped = capText('x'.repeat(MAX_CAPPED_CHARS) + 'END');

		expect(capped.truncated).toBe(true);
		expect(capped.totalChars).toBe(MAX_CAPPED_CHARS + 3);
		expect(capped.text).toHaveLength(MAX_CAPPED_CHARS);
		expect(capped.text.endsWith('END')).toBe(true);
	});
});

describe('describeStepIO: declared', () => {
	it('lists the references of a prompt without exposing the prompt itself', () => {
		const io = describeStepIO(step('implement'), undefined);

		expect(io.declaredInputs).toEqual([{ name: 'prompt', references: ['steps.plan.outputs.plan'], length: 40 }]);
		expect(JSON.stringify(io)).not.toContain('Implement ${{');
	});

	it('shows env values as written in the flow file, secret-named ones included, and keeps the reference names', () => {
		const io = describeStepIO(step('test'), undefined);

		expect(io.declaredInputs).toContainEqual({
			name: 'env.GITHUB_TOKEN',
			value: '${{ secrets.GH }}',
			references: ['secrets.GH'],
		});
		expect(io.declaredInputs).toContainEqual({ name: 'env.REGION', value: 'eu', references: [] });
		expect(io.declaredInputs).toContainEqual({
			name: 'script',
			references: ['steps.implement.outputs.files'],
			length: expect.any(Number),
		});
	});

	it('shows the inputs of a sub-flow as written, secret-named ones included', () => {
		const io = describeStepIO(step('deploy'), undefined);

		expect(io.declaredInputs).toContainEqual({
			name: 'inputs.version',
			value: '${{ steps.ship.outputs.version }}',
			references: ['steps.ship.outputs.version'],
		});
		expect(io.declaredInputs).toContainEqual({ name: 'inputs.api_key', value: 'abc123', references: [] });
	});

	it('lists the declared outputs, including the captured stdout', () => {
		expect(describeStepIO(step('test'), undefined).declaredOutputs).toEqual([
			{ name: 'passed', type: 'boolean', source: 'pattern PASS' },
			{ name: 'stdout', type: 'string', source: 'captured stdout' },
		]);
	});

	it('says what the record does not hold', () => {
		const { notes } = describeStepIO(step('plan'), undefined);

		expect(notes.inputs).toMatch(/not recorded for this run/i);
		expect(notes.outputs).toMatch(/not recorded for this run/i);
	});
});

const ESC = '\u001b';

describe('describeStepIO: recorded', () => {
	it('exposes the metadata a model step reported, without the session file path', () => {
		const io = describeStepIO(step('plan'), COMPLETED_WITH_LOOP.steps['plan']);

		expect(io.recorded).toMatchObject({
			sessionId: 'sess-123',
			costUsd: 0.42,
			ttftMs: 900,
			durationMs: 59000,
			tokens: { input: 1200, output: 800, cacheRead: 10, cacheWrite: 20 },
		});
		expect(JSON.stringify(io)).not.toContain('.jsonl');
	});

	it('exposes the exit code of a script step', () => {
		expect(describeStepIO(step('test'), COMPLETED_WITH_LOOP.steps['test']).recorded.exitCode).toBe(0);
	});

	it('exposes stdout and stderr of a failed step as stored (masking is done at write time, not here)', () => {
		const { recorded } = describeStepIO(step('test'), FAILED_AT_TEST.steps['test']);

		expect(recorded.stdout?.text).toBe('running tests\nFAIL a.test.ts');
		expect(recorded.stderr?.text).toBe('Error: 3 tests failed');
		expect(recorded).not.toHaveProperty('redactions');
		expect(recorded).not.toHaveProperty('redactionsLabel');
	});

	describe('terminal control and truncation order', () => {
		const failed = (stdout: string, error?: string) =>
			describeStepIO(undefined, { status: 'failed', stdout, ...(error !== undefined ? { error } : {}) }).recorded;

		it('strips colour codes and progress overwrites from stdout', () => {
			const { stdout } = failed(`${ESC}[36mcyan${ESC}[0m\n10%\r100%\n`);

			expect(stdout?.text).toBe('cyan\n100%\n');
		});

		it('counts the characters of the cleaned text, not of the raw capture', () => {
			const coloured = `${ESC}[36mline${ESC}[0m\n`.repeat(1000);
			const { stdout } = failed(coloured);

			// 1000 lines of 5 characters once cleaned; the raw capture is much longer than that.
			expect(stdout?.totalChars).toBe(5000);
			expect(coloured.length).toBeGreaterThan(10_000);
			expect(stdout?.truncated).toBe(true);
			expect(stdout?.text).toHaveLength(MAX_CAPPED_CHARS);
			expect(stdout?.text).not.toContain(ESC);
		});

		it('does not guess secrets: an assignment that looks like a token is served as stored', () => {
			const { stdout } = failed('API_KEY=abc123def');

			expect(stdout?.text).toBe('API_KEY=abc123def');
		});
	});

	it('caps and truncates long relaunch feedback', () => {
		const io = describeStepIO(undefined, {
			status: 'completed',
			relaunches: [{ at: '2026-08-16T12:00:30.000Z', feedback: `retry ${ESC}[31m${'y'.repeat(1000)}` }],
		});

		expect(io.recorded.relaunches[0]!.feedback.length).toBeLessThanOrEqual(300);
		expect(io.recorded.relaunches[0]!.feedback).not.toContain(ESC);
	});

	it('has an empty record for a step that never started and no declaration for an unknown step', () => {
		const io = describeStepIO(undefined, undefined);

		expect(io.declaredInputs).toEqual([]);
		expect(io.declaredOutputs).toEqual([]);
		expect(io.recorded).toEqual({ relaunches: [] });
	});
});

describe('findDataLinks', () => {
	const links = findDataLinks(BUILD_FLOW);

	it('finds the steps whose output a step uses, with the fields and output names', () => {
		expect(links['implement']!.usesOutputOf).toEqual([{ stepId: 'plan', outputs: ['plan'], fields: ['prompt'] }]);
		expect(links['ship']!.usesOutputOf).toEqual([{ stepId: 'test', outputs: ['passed'], fields: ['when'] }]);
		expect(links['deploy']!.usesOutputOf).toEqual([
			{ stepId: 'ship', outputs: ['version'], fields: ['inputs.version'] },
		]);
	});

	it('inverts them into the steps that use a step', () => {
		expect(links['test']!.usedBy.map(link => link.stepId)).toEqual(['ship', 'notify']);
		expect(links['plan']!.usesOutputOf).toEqual([]);
	});

	it('follows context.previousOutputs and session.continue, and ignores unknown steps and the step itself', () => {
		const flow = {
			...BUILD_FLOW,
			steps: [
				{ id: 'a', name: 'A', type: 'model', prompt: '${{ steps.ghost.outputs.x }} ${{ steps.a.outputs.y }}' },
				{
					id: 'b',
					name: 'B',
					type: 'model',
					prompt: 'p',
					context: { previousOutputs: ['a'] },
					session: { continue: 'a', mode: 'append' },
				},
			],
		} as unknown as typeof BUILD_FLOW;
		const found = findDataLinks(flow);

		expect(found['a']!.usesOutputOf).toEqual([]);
		expect(found['b']!.usesOutputOf).toEqual([
			{ stepId: 'a', outputs: [], fields: ['context.previousOutputs', 'session.continue'] },
		]);
	});
});

describe('referencedInputNames', () => {
	it('finds the flow inputs a step reads in its prompt, script, env and when, once each', () => {
		const model = {
			id: 'm',
			name: 'M',
			type: 'model',
			prompt: 'A ${{ inputs.task }} {% if inputs.mode %}x{% endif %} ${{ inputs.task }}',
			env: { K: '${{ inputs.region }}' },
			when: '${{ inputs.gate }} == "go"',
		} as unknown as FlowStep;

		expect(referencedInputNames(model)).toEqual(['task', 'mode', 'region', 'gate']);
	});

	it('ignores text outside template syntax and other namespaces', () => {
		const script = {
			id: 's',
			name: 'S',
			type: 'script',
			script: 'echo inputs.fake ${{ steps.a.outputs.inputs_x }} ${{ context.inputs.y }}',
		} as unknown as FlowStep;

		expect(referencedInputNames(script)).toEqual([]);
	});
});

describe('describeStepIO: recorded inputs and outputs', () => {
	const value = (text: string, truncated = false, chars = text.length) => ({ text, truncated, chars });
	const io = {
		inputs: { 'inputs.task': value('fix it'), prompt: value(`${ESC}[31mred${ESC}[0m`) },
		outputs: { plan: value('step one', true, 9000) },
		stdout: value('done'),
		truncated: true,
		storedChars: 40,
	};

	it('exposes the recorded values with terminal control stripped and the original length kept', () => {
		const { recorded } = describeStepIO(undefined, { status: 'completed', io });

		expect(recorded.io?.inputs['inputs.task']).toEqual(value('fix it'));
		expect(recorded.io?.inputs['prompt']?.text).toBe('red');
		expect(recorded.io?.outputs['plan']).toEqual(value('step one', true, 9000));
		expect(recorded.io?.stdout?.text).toBe('done');
		expect(recorded.io?.truncated).toBe(true);
	});

	it('has no notes about missing values when they were recorded', () => {
		expect(describeStepIO(undefined, { status: 'completed', io }).notes).toEqual({ inputs: '', outputs: '' });
	});

	it('says "not recorded for this run" for an old record', () => {
		const { notes, recorded } = describeStepIO(step('plan'), COMPLETED_WITH_LOOP.steps['plan']);

		expect(recorded.io).toBeUndefined();
		expect(notes.inputs).toMatch(/not recorded for this run/i);
		expect(notes.outputs).toMatch(/not recorded for this run/i);
	});
});
