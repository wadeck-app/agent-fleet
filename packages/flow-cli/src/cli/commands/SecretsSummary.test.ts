import type { FlowDefinition } from 'flow-engine/types';

import { renderSecretsSummary } from './SecretsSummary';

function flowWith(inputs: Record<string, unknown>, steps: unknown[]): FlowDefinition {
	return { id: 'f', version: '1', name: 'f', inputs, steps } as unknown as FlowDefinition;
}

describe('renderSecretsSummary', () => {
	it('is empty for a flow that declares no secret', () => {
		expect(renderSecretsSummary(flowWith({ a: 'string' }, [{ id: 's', type: 'script', script: 'x' }]))).toBe('');
	});

	it('lists each secret with its source kind and the steps that use it, never a value', () => {
		const out = renderSecretsSummary(
			flowWith(
				{
					API_TOKEN: { type: 'password', required: true, description: 'GitHub token' },
					DB_PASSWORD: { type: 'password', default: 'file://./db.txt' },
					UNUSED: 'password',
				},
				[
					{ id: 'call', type: 'script', script: 'x', secrets: ['API_TOKEN'] },
					{ id: 'dump', type: 'script', script: 'echo ${{ inputs.DB_PASSWORD }}' },
				]
			)
		);
		expect(out).toContain('API_TOKEN');
		expect(out).toContain('run-time');
		expect(out).toContain('GitHub token');
		expect(out).toContain('call');
		expect(out).toContain('DB_PASSWORD');
		expect(out).toContain('file://');
		expect(out).toContain('dump');
		expect(out).toContain('UNUSED');
		expect(out).toContain('(not used by any step)');
		expect(out).toContain('[secret:NAME]');
		expect(out).not.toContain('./db.txt');
	});
});
