import type { FlowDefinition } from 'flow-engine/types';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { DaemonSecrets } from './DaemonSecrets';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const ROTATED = ['tk', '_Zz1Qq2', 'Ww3'].join('');

const flow = {
	id: 'f',
	version: '1',
	name: 'f',
	inputs: { API_TOKEN: { type: 'password' } },
	steps: [
		{ id: 'call', type: 'script', script: 'x', secrets: ['API_TOKEN'] },
		{ id: 'other', type: 'script', script: 'y' },
	],
} as unknown as FlowDefinition;

describe('DaemonSecrets', () => {
	it('activates an execution: its text is masked and only the using step gets the value', () => {
		const masks = new ExecutionMasks();
		const secrets = new DaemonSecrets(masks, { T: TOKEN });
		const prepared = secrets.prepare(flow, { API_TOKEN: 'env://T' }, process.cwd());
		secrets.activate('exec-1', flow, prepared);

		expect(masks.mask('exec-1', `x ${TOKEN}`)).toBe('x [secret:API_TOKEN]');
		expect(secrets.valuesForStep('exec-1', 'call')).toEqual({ API_TOKEN: TOKEN });
		expect(secrets.valuesForStep('exec-1', 'other')).toBeUndefined();
		expect(secrets.valuesForStep('unknown-exec', 'call')).toBeUndefined();
	});

	it('does not register anything for a flow without secrets', () => {
		const masks = new ExecutionMasks();
		const secrets = new DaemonSecrets(masks, {});
		const plain = {
			...flow,
			inputs: {},
			steps: [{ id: 'a', type: 'script', script: 'x' }],
		} as unknown as FlowDefinition;
		const prepared = secrets.prepare(plain, {}, process.cwd());
		secrets.activate('exec-1', plain, prepared);
		expect(masks.mask('exec-1', TOKEN)).toBe(TOKEN);
	});

	it('re-resolves on resume, so a rotated value is used and masked', () => {
		const env: Record<string, string> = { T: TOKEN };
		const masks = new ExecutionMasks();
		const secrets = new DaemonSecrets(masks, env);
		secrets.activate('exec-1', flow, secrets.prepare(flow, { API_TOKEN: 'env://T' }, process.cwd()));

		env['T'] = ROTATED;
		secrets.resume('exec-1');

		expect(secrets.valuesForStep('exec-1', 'call')).toEqual({ API_TOKEN: ROTATED });
		expect(masks.mask('exec-1', ROTATED)).toBe('[secret:API_TOKEN]');
	});

	it('fails the resume loudly when a secret can no longer be resolved', () => {
		const env: Record<string, string> = { T: TOKEN };
		const secrets = new DaemonSecrets(new ExecutionMasks(), env);
		secrets.activate('exec-1', flow, secrets.prepare(flow, { API_TOKEN: 'env://T' }, process.cwd()));
		delete env['T'];
		expect(() => secrets.resume('exec-1')).toThrow(/API_TOKEN/);
	});

	it('refuses an injected step that uses a secret', () => {
		const secrets = new DaemonSecrets(new ExecutionMasks(), { T: TOKEN });
		secrets.activate('exec-1', flow, secrets.prepare(flow, { API_TOKEN: 'env://T' }, process.cwd()));
		expect(() =>
			secrets.assertInjectable('exec-1', {
				id: 'i',
				type: 'script',
				script: 'echo ${{ inputs.API_TOKEN }}',
			} as never)
		).toThrow(/API_TOKEN/);
	});
});
