import { describe, expect, it } from 'vitest';

import type { FlowDefinition, FlowStep, ScriptFlowStep } from '../types';
import { SecretUsageAnalyzer } from './SecretUsageAnalyzer';

const analyzer = new SecretUsageAnalyzer();

function script(id: string, extra: Record<string, unknown> = {}): ScriptFlowStep {
	return { id, name: id, type: 'script', script: 'echo hi', ...extra } as ScriptFlowStep;
}

function flow(inputs: Record<string, unknown>, steps: FlowStep[]): FlowDefinition {
	return { id: 'f', name: 'F', inputs, steps } as unknown as FlowDefinition;
}

describe('SecretUsageAnalyzer.NAME_PATTERN', () => {
	it.each(['API_TOKEN', '_x', 'a1'])('accepts %s', name => {
		expect(SecretUsageAnalyzer.NAME_PATTERN.test(name)).toBe(true);
	});

	it.each(['1abc', 'my-token', 'a b', ''])('rejects %j', name => {
		expect(SecretUsageAnalyzer.NAME_PATTERN.test(name)).toBe(false);
	});
});

describe('SecretUsageAnalyzer.secretInputNames', () => {
	it('returns password inputs in shorthand and object form only', () => {
		const result = analyzer.secretInputNames(
			flow({ A: 'password', B: { type: 'password' }, C: 'string', D: { type: 'text' } }, [script('s')])
		);
		expect(result).toEqual(['A', 'B']);
	});

	it('returns an empty list when the flow has no inputs', () => {
		expect(analyzer.secretInputNames({ id: 'f', name: 'F', steps: [] } as unknown as FlowDefinition)).toEqual([]);
	});
});

describe('SecretUsageAnalyzer.referencedInputNames', () => {
	it('finds inputs in ${{ }} expressions of nested string leaves', () => {
		const step = script('s', {
			script: 'curl ${{ inputs.URL }}',
			env: { H: 'Bearer ${{inputs.TOKEN}}' },
			nested: { list: ['x ${{ inputs.DEEP }}', 3, null] },
		});
		expect(analyzer.referencedInputNames(step).sort()).toEqual(['DEEP', 'TOKEN', 'URL']);
	});

	it('finds inputs in {% %} regions', () => {
		const step = script('s', { script: '{% if inputs.FLAG %}x{% endif %}' });
		expect(analyzer.referencedInputNames(step)).toEqual(['FLAG']);
	});

	it('ignores escaped $${{ }} literals', () => {
		const step = script('s', { script: 'echo $${{ inputs.TOKEN }} ${{ inputs.REAL }}' });
		expect(analyzer.referencedInputNames(step)).toEqual(['REAL']);
	});

	it('ignores inputs.X outside of template regions', () => {
		expect(analyzer.referencedInputNames(script('s', { script: 'echo inputs.TOKEN' }))).toEqual([]);
	});

	it('ignores the step secrets key', () => {
		const step = script('s', { secrets: ['${{ inputs.TOKEN }}'] });
		expect(analyzer.referencedInputNames(step)).toEqual([]);
	});

	it('does not treat steps.x.inputs.Y as an input reference', () => {
		const step = script('s', { script: '${{ steps.a.outputs.inputs.Y }}' });
		expect(analyzer.referencedInputNames(step)).toEqual([]);
	});

	it('deduplicates names', () => {
		const step = script('s', { script: '${{ inputs.A }} ${{ inputs.A }}' });
		expect(analyzer.referencedInputNames(step)).toEqual(['A']);
	});
});

describe('SecretUsageAnalyzer.referencedInputNamesIn', () => {
	it('scans any value (string, array, object) like a step', () => {
		expect(analyzer.referencedInputNamesIn({ a: '${{ inputs.X }}', b: ['{% if inputs.Y %}z{% endif %}'] })).toEqual(
			['X', 'Y']
		);
	});
});

describe('SecretUsageAnalyzer.stepSecretNames', () => {
	const secretNames = new Set(['A', 'B', 'C']);

	it('unions explicit entries and referenced secrets, sorted and deduped', () => {
		const step = script('s', {
			secrets: ['C', 'A'],
			script: '${{ inputs.A }} ${{ inputs.B }} ${{ inputs.plain }}',
		});
		expect(analyzer.stepSecretNames(step, secretNames)).toEqual(['A', 'B', 'C']);
	});

	it('keeps explicit entries even when they are not declared secrets', () => {
		const step = script('s', { secrets: ['UNKNOWN'] });
		expect(analyzer.stepSecretNames(step, secretNames)).toEqual(['UNKNOWN']);
	});

	it('ignores a non-array secrets value', () => {
		const step = script('s', { secrets: 'A' });
		expect(analyzer.stepSecretNames(step, secretNames)).toEqual([]);
	});

	it('returns an empty list when nothing is used', () => {
		expect(analyzer.stepSecretNames(script('s'), secretNames)).toEqual([]);
	});
});

describe('SecretUsageAnalyzer.describe', () => {
	it('describes declarations sorted by name with usage and source kind', () => {
		const f = flow(
			{
				ZED: { type: 'password', description: 'Zed token', required: true },
				ALPHA: { type: 'password', default: 'env://ALPHA_VAR' },
				MID: { type: 'password', default: 'file://./secrets/mid.txt' },
				plain: 'string',
			},
			[script('one', { secrets: ['ALPHA'] }), script('two', { script: '${{ inputs.ZED }}', secrets: ['ALPHA'] })]
		);
		expect(analyzer.describe(f)).toEqual([
			{
				name: 'ALPHA',
				required: false,
				defaultReference: 'env://ALPHA_VAR',
				sourceKind: 'env',
				usedBy: ['one', 'two'],
			},
			{
				name: 'MID',
				required: false,
				defaultReference: 'file://./secrets/mid.txt',
				sourceKind: 'file',
				usedBy: [],
			},
			{ name: 'ZED', description: 'Zed token', required: true, sourceKind: 'run-time', usedBy: ['two'] },
		]);
	});

	it('describes shorthand password inputs as optional run-time secrets', () => {
		expect(analyzer.describe(flow({ T: 'password' }, [script('s')]))).toEqual([
			{ name: 'T', required: false, sourceKind: 'run-time', usedBy: [] },
		]);
	});
});
