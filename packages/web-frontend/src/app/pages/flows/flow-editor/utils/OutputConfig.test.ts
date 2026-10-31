import { describe, expect, it } from 'vitest';

import { extractOutputPorts } from './VariableExtractor';
import { resolveOutputConfig } from './OutputConfig';
import type { FlowStep } from '../types/flow-engine.types';

describe('resolveOutputConfig', () => {
	it('returns a full config as is', () => {
		expect(resolveOutputConfig({ type: 'number', required: true })).toEqual({ type: 'number', required: true });
	});

	it('reads a subflow template string as an untyped (string) output', () => {
		expect(resolveOutputConfig('${{ steps.a.outputs.b }}')).toEqual({ type: 'string' });
	});
});

describe('extractOutputPorts with a subflow template output', () => {
	it('exposes the template output as a string port', () => {
		const step: FlowStep = {
			id: 'sub',
			name: 'sub',
			type: 'subflow',
			flowId: 'other',
			inputs: {},
			output: { result: '${{ outputs.x }}', count: { type: 'integer', required: true } },
		};
		expect(extractOutputPorts(step).map(port => [port.name, port.type, port.required])).toEqual([
			['result', 'string', undefined],
			['count', 'integer', true],
		]);
	});
});
