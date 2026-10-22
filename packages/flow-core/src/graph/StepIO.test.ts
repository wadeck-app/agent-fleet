import type { FlowStep } from 'flow-engine/types';
import { describe, expect, it } from 'vitest';

import { BUILD_FLOW, COMPLETED_WITH_LOOP, FAILED_AT_TEST } from './RunFixtures.js';
import { REDACTED_TEXT } from './SecretRedaction.js';
import { MAX_CAPPED_CHARS, capText, describeStepIO, findDataLinks } from './StepIO.js';

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

	it('shows env values, hides the secret-named ones and keeps the reference names', () => {
		const io = describeStepIO(step('test'), undefined);

		expect(io.declaredInputs).toContainEqual({
			name: 'env.GITHUB_TOKEN',
			value: REDACTED_TEXT,
			references: ['secrets.GH'],
		});
		expect(io.declaredInputs).toContainEqual({ name: 'env.REGION', value: 'eu', references: [] });
		expect(io.declaredInputs).toContainEqual({
			name: 'script',
			references: ['steps.implement.outputs.files'],
			length: expect.any(Number),
		});
	});

	it('shows the inputs of a sub-flow and hides secret-named ones', () => {
		const io = describeStepIO(step('deploy'), undefined);

		expect(io.declaredInputs).toContainEqual({
			name: 'inputs.version',
			value: '${{ steps.ship.outputs.version }}',
			references: ['steps.ship.outputs.version'],
		});
		expect(io.declaredInputs).toContainEqual({ name: 'inputs.api_key', value: REDACTED_TEXT, references: [] });
	});

	it('lists the declared outputs, including the captured stdout', () => {
		expect(describeStepIO(step('test'), undefined).declaredOutputs).toEqual([
			{ name: 'passed', type: 'boolean', source: 'pattern PASS' },
			{ name: 'stdout', type: 'string', source: 'captured stdout' },
		]);
	});

	it('says what the record does not hold', () => {
		const { notes } = describeStepIO(step('plan'), undefined);

		expect(notes.inputs).toMatch(/resolved values not recorded/i);
		expect(notes.outputs).toMatch(/outputs are not recorded/i);
	});
});

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

	it('exposes stdout and stderr of a failed step, with secret assignments hidden', () => {
		const { recorded } = describeStepIO(step('test'), FAILED_AT_TEST.steps['test']);

		expect(recorded.stdout?.text).toContain('FAIL a.test.ts');
		expect(recorded.stdout?.text).not.toContain('ghp_abcdefghijklmnop1234');
		expect(recorded.stderr?.text).toBe('Error: 3 tests failed');
	});

	it('caps and truncates long relaunch feedback', () => {
		const io = describeStepIO(undefined, {
			status: 'completed',
			relaunches: [{ at: '2026-08-16T12:00:30.000Z', feedback: `password=hunter2 ${'y'.repeat(1000)}` }],
		});

		expect(io.recorded.relaunches[0]!.feedback.length).toBeLessThanOrEqual(300);
		expect(io.recorded.relaunches[0]!.feedback).not.toContain('hunter2');
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
