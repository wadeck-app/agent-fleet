import type { FlowDefinition } from 'flow-engine/types';

import { ExecutionSecrets } from './ExecutionSecrets';
import { SecretTooShortError, SecretUnresolvedError, SecretsResolutionFailedError } from './SecretErrors';
import { SecretProvider } from './SecretProvider';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const OTHER = ['ot', '_Zz1Qq2', 'Ww3'].join('');

function flowWith(overrides: Record<string, unknown> = {}): FlowDefinition {
	return {
		id: 'f',
		version: '1',
		name: 'f',
		inputs: {
			API_TOKEN: { type: 'password', required: false },
			UNUSED_KEY: { type: 'password', required: false },
			plain: 'string',
		},
		steps: [
			{ id: 'call', type: 'script', script: 'echo hi', secrets: ['API_TOKEN'] },
			{ id: 'other', type: 'script', script: 'echo ${{ inputs.plain }}' },
		],
		...overrides,
	} as unknown as FlowDefinition;
}

const provider = (env: Record<string, string>): SecretProvider => new SecretProvider(process.cwd(), env);

describe('ExecutionSecrets.resolve', () => {
	it('resolves the secrets a step uses, from the references given at run time', () => {
		const secrets = ExecutionSecrets.resolve(
			flowWith(),
			{ API_TOKEN: 'env://T', plain: 'x' },
			provider({ T: TOKEN })
		);
		expect(secrets.valuesForStep('call')).toEqual({ API_TOKEN: TOKEN });
		expect(secrets.valuesForStep('other')).toEqual({});
		expect(secrets.masker.mask(`a ${TOKEN}`)).toBe('a [secret:API_TOKEN]');
	});

	it('uses the declared default reference when none is given', () => {
		const flow = flowWith({ inputs: { API_TOKEN: { type: 'password', default: 'env://T' } } });
		const secrets = ExecutionSecrets.resolve(flow, {}, provider({ T: TOKEN }));
		expect(secrets.valuesForStep('call')).toEqual({ API_TOKEN: TOKEN });
	});

	it('strips secret names from the inputs that reach every step', () => {
		const secrets = ExecutionSecrets.resolve(
			flowWith(),
			{ API_TOKEN: 'env://T', plain: 'x' },
			provider({ T: TOKEN })
		);
		expect(secrets.publicInputs({ API_TOKEN: 'env://T', plain: 'x' })).toEqual({ plain: 'x' });
	});

	it('does not resolve a declared secret that no step uses', () => {
		const secrets = ExecutionSecrets.resolve(flowWith(), { API_TOKEN: 'env://T' }, provider({ T: TOKEN }));
		expect(secrets.masker.mask(OTHER)).toBe(OTHER);
	});

	it('refuses to start when a used secret was not supplied, naming the input and how to supply it', () => {
		const attempt = (): unknown => ExecutionSecrets.resolve(flowWith(), {}, provider({}));
		expect(attempt).toThrow(SecretsResolutionFailedError);
		expect(attempt).toThrow(/API_TOKEN/);
		expect(attempt).toThrow(/-i API_TOKEN=env:\/\//);
	});

	it('reports every failing secret together', () => {
		const flow = flowWith({
			steps: [
				{ id: 'a', type: 'script', script: 'x', secrets: ['API_TOKEN'] },
				{ id: 'b', type: 'script', script: 'x', secrets: ['UNUSED_KEY'] },
			],
		});
		try {
			ExecutionSecrets.resolve(
				flow,
				{ API_TOKEN: 'env://MISSING', UNUSED_KEY: 'env://SHORT' },
				provider({ SHORT: 'abc' })
			);
			expect.unreachable('must throw');
		} catch (error) {
			const failures = (error as SecretsResolutionFailedError).failures;
			expect(failures.map(failure => failure.constructor)).toEqual([SecretUnresolvedError, SecretTooShortError]);
		}
	});

	it('refuses a literal given instead of a reference without echoing it', () => {
		const attempt = (): unknown => ExecutionSecrets.resolve(flowWith(), { API_TOKEN: TOKEN }, provider({}));
		expect(attempt).toThrow(SecretsResolutionFailedError);
		expect(attempt).not.toThrow(new RegExp(TOKEN));
	});

	it('returns an empty set for a flow without secrets', () => {
		const flow = flowWith({ inputs: { plain: 'string' }, steps: [{ id: 'a', type: 'script', script: 'x' }] });
		const secrets = ExecutionSecrets.resolve(flow, { plain: 'x' }, provider({}));
		expect(secrets.isEmpty).toBe(true);
		expect(secrets.publicInputs({ plain: 'x' })).toEqual({ plain: 'x' });
	});
});

describe('ExecutionSecrets.assertInjectable', () => {
	it('refuses an injected step that references a declared secret, even when it was not resolved', () => {
		const secrets = ExecutionSecrets.resolve(flowWith(), { API_TOKEN: 'env://T' }, provider({ T: TOKEN }));
		const injected = { id: 'inj', type: 'script', script: 'echo ${{ inputs.UNUSED_KEY }}' };
		expect(() => secrets.assertInjectable(injected as never)).toThrow(/UNUSED_KEY/);
		expect(() => secrets.assertInjectable({ id: 'ok', type: 'script', script: 'echo 1' } as never)).not.toThrow();
	});
});
