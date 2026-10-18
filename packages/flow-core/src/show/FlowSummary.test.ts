import type { FlowDefinition } from 'flow-engine/types';
import { describe, expect, it } from 'vitest';

import { formatInputs, formatStatus, formatTrigger, renderFlowSummary, stepDepends, stepType } from './FlowSummary.js';

const flow = {
	id: 'simple-flow',
	version: '1.0.0',
	name: 'Simple Test Flow',
	description: 'A simple flow for unit testing',
	workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'if-available' },
	inputs: { message: { type: 'string', required: true } },
	steps: [
		{
			id: 'step-one',
			type: 'script',
			script: 'echo hello',
			output: { result: { type: 'string', from: 'stdout' } },
		},
		{ id: 'step-two', type: 'model', model: 'haiku', prompt: 'hi', depends: ['step-one'] },
		{ id: 'step-approve', type: 'user_intervention', interventionType: 'approval', depends: ['step-two'] },
	],
} as unknown as FlowDefinition;

describe('renderFlowSummary', () => {
	it('returns the table as a string without printing', () => {
		const out = renderFlowSummary(flow);
		expect(typeof out).toBe('string');
		expect(out).toContain('simple-flow  v1.0.0');
		expect(out).toContain('Simple Test Flow');
		expect(out).toContain('A simple flow for unit testing');
		expect(out).toContain('workspace: manual  git:any  reuse:if-available');
		expect(out).toContain('inputs:    message (string, required)');
	});

	it('lists every step with its type, dependency index and outputs', () => {
		const out = renderFlowSummary(flow);
		expect(out).toContain('step-one');
		expect(out).toMatch(/step-one\s+script\s+-\s+result/);
		expect(out).toMatch(/step-two\s+haiku\s+1/);
		expect(out).toContain('3 steps:  1 script   1 haiku   1 user_intervention');
	});

	it('marks blocking user_intervention steps with (!)', () => {
		expect(renderFlowSummary(flow)).toContain('step-approve (!)');
	});

	it('skips the description when it equals the name', () => {
		const out = renderFlowSummary({ ...flow, description: flow.name } as FlowDefinition);
		expect(out.split('Simple Test Flow')).toHaveLength(2);
	});

	it('shows loops and retries after the outputs', () => {
		const looping = {
			...flow,
			steps: [
				{ id: 'a', type: 'script', script: 'x', retry: { maxAttempts: 3 } },
				{ id: 'b', type: 'script', script: 'x', onFailure: { goto: 'a', maxIterations: 2 } },
			],
		} as unknown as FlowDefinition;
		const out = renderFlowSummary(looping);
		expect(out).toContain('retry:3x');
		expect(out).toContain('err -> 1  max:2x');
	});
});

describe('stepType', () => {
	it('names the model, script, subflow target or intervention type', () => {
		expect(stepType({ id: 'a', type: 'model', model: 'sonnet' } as never)).toBe('sonnet');
		expect(stepType({ id: 'a', type: 'model' } as never)).toBe('model');
		expect(stepType({ id: 'a', type: 'script' } as never)).toBe('script');
		expect(stepType({ id: 'a', type: 'subflow', flowId: 'other' } as never)).toBe('subflow:other');
		expect(stepType({ id: 'a', type: 'user_intervention', interventionType: 'approval' } as never)).toBe(
			'approval'
		);
	});
	it('fails fast on an unknown step type', () => {
		expect(() => stepType({ id: 'a', type: 'weird' } as never)).toThrow(/Unknown step type: weird/);
	});
});

describe('stepDepends', () => {
	const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never[];
	it('is "-" without dependencies', () => {
		expect(stepDepends({ id: 'a' } as never, steps)).toBe('-');
	});
	it('maps ids to 1-based positions and keeps unknown ids', () => {
		expect(stepDepends({ id: 'c', depends: ['a', 'zzz'] } as never, steps)).toBe('1, zzz');
	});
	it('appends a shortened when-condition', () => {
		expect(
			stepDepends({ id: 'c', depends: ['b'], when: '${{ steps.b.outputs.ok }} == true' } as never, steps)
		).toBe('2: if(ok  == true)');
	});
});

describe('formatInputs', () => {
	it('is "(none)" without inputs', () => {
		// Hand-written YAML can omit the key although the type says it is always there.
		expect(formatInputs(undefined as never)).toBe('(none)');
		expect(formatInputs({})).toBe('(none)');
	});
	it('prints type, requiredness and default', () => {
		expect(
			formatInputs({
				a: 'string',
				b: { type: 'number', required: false, default: 3 },
				c: {},
			} as never)
		).toBe('a (string)   b (number, default: 3)   c (string, required)');
	});
});

describe('formatStatus', () => {
	it('is empty without transitions', () => {
		expect(formatStatus(flow)).toBe('');
	});
	it('accepts string and object transitions', () => {
		expect(formatStatus({ statusTransitions: { onSuccess: 'done', onFailure: { task: 'todo' } } } as never)).toBe(
			'ok -> done   fail -> todo'
		);
		expect(formatStatus({ statusTransitions: { onSuccess: {}, onFailure: 'x' } } as never)).toBe(
			'ok -> ?   fail -> x'
		);
	});
});

describe('formatTrigger', () => {
	it('is empty without trigger or for a non-event trigger', () => {
		expect(formatTrigger(flow)).toBe('');
		expect(formatTrigger({ trigger: { type: 'manual' } } as never)).toBe('');
	});
	it('prints event name and filter', () => {
		expect(formatTrigger({ trigger: { type: 'event', event: 'task.created' } } as never)).toBe(
			'trigger: event:task.created'
		);
		expect(formatTrigger({ trigger: { type: 'event', event: 'e', filter: { a: 1, b: 'x' } } } as never)).toBe(
			'trigger: event:e a=1, b=x'
		);
	});
});
