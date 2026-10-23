import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SecretValidator } from './SecretValidator';
import type { ValidationIssue } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

const issues: ValidationIssue[] = [];
const validator = new SecretValidator({ addIssue: issue => issues.push(issue) });

function flow(parts: Record<string, unknown>): FlowDefinition {
	return { id: 'f', name: 'F', inputs: { API_TOKEN: 'password' }, steps: [], ...parts } as unknown as FlowDefinition;
}

function script(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { id: 's', name: 'S', type: 'script', script: 'echo hi', ...extra };
}

function codes(): string[] {
	return issues.map(issue => issue.code);
}

beforeEach(() => {
	issues.length = 0;
});

describe('SecretValidator - secrets: on steps', () => {
	it('accepts a script step listing a declared password input', () => {
		validator.validateSecrets(flow({ steps: [script({ secrets: ['API_TOKEN'] })] }));
		expect(issues).toEqual([]);
	});

	it.each(['model', 'user_intervention', 'subflow'])('rejects secrets: on a %s step', type => {
		validator.validateSecrets(flow({ steps: [{ id: 'x', name: 'X', type, secrets: ['API_TOKEN'] }] }));
		const issue = issues.find(i => i.code === ValidationCode.SECRET_FORBIDDEN_STEP);
		expect(issue?.severity).toBe('error');
		expect(issue?.message).toContain("'x'");
		expect(issue?.suggestion).toContain('script');
	});

	it.each(['API_TOKEN', [1], { a: 1 }])('rejects secrets that is not an array of strings: %j', secrets => {
		validator.validateSecrets(flow({ steps: [script({ secrets })] }));
		expect(codes()).toEqual([ValidationCode.INVALID_TYPE]);
		expect(issues[0].message).toContain("'s'");
	});

	it('reports an unknown secret and lists the declared ones', () => {
		validator.validateSecrets(
			flow({
				inputs: { API_TOKEN: 'password', other: 'string' },
				steps: [script({ secrets: ['other', 'NOPE'] })],
			})
		);
		expect(codes()).toEqual([ValidationCode.SECRET_UNKNOWN, ValidationCode.SECRET_UNKNOWN]);
		expect(issues[1].message).toContain('NOPE');
		expect(issues[1].message).toContain("'s'");
		expect(issues[1].context?.related).toEqual(['API_TOKEN']);
		expect(issues[1].suggestion).toContain('type: password');
	});
});

describe('SecretValidator - password inputs', () => {
	it('rejects names that cannot be environment variable names', () => {
		validator.validateSecrets(flow({ inputs: { 'my-token': 'password', '1x': { type: 'password' } } }));
		expect(codes()).toEqual([ValidationCode.SECRET_INVALID_NAME, ValidationCode.SECRET_INVALID_NAME]);
		expect(issues[0].message).toContain('my-token');
		expect(issues[0].suggestion).toContain('[A-Za-z_][A-Za-z0-9_]*');
	});

	it.each(['env://MY_VAR', 'file://./secrets/token.txt', 'file://secrets/token.txt'])('accepts default %s', value => {
		validator.validateSecrets(flow({ inputs: { API_TOKEN: { type: 'password', default: value } } }));
		expect(issues).toEqual([]);
	});

	it.each([
		'hunter2hunter2',
		'input://other',
		'value://abc',
		'file:///etc/token',
		'file://C:/token',
		'file://C:\token',
		'file://../token',
		'file://',
		'env://',
		'env://1BAD',
		42,
	])('rejects default %j without echoing it', value => {
		validator.validateSecrets(flow({ inputs: { API_TOKEN: { type: 'password', default: value } } }));
		expect(codes()).toEqual([ValidationCode.SECRET_BAD_REFERENCE]);
		expect(issues[0].message).toContain('API_TOKEN');
		// A literal default is a secret: it must never be echoed back
		expect(JSON.stringify(issues[0])).not.toContain('hunter2hunter2');
		expect(issues[0].suggestion).toContain('env://');
		expect(issues[0].suggestion).toContain('file://');
	});
});

describe('SecretValidator - secret references', () => {
	it.each([
		['model', { prompt: 'use ${{ inputs.API_TOKEN }}' }],
		['user_intervention', { title: '{% if inputs.API_TOKEN %}x{% endif %}' }],
		['subflow', { flowId: 'g', inputs: { t: '${{ inputs.API_TOKEN }}' } }],
	])('forbids a %s step referencing a secret', (type, extra) => {
		validator.validateSecrets(flow({ steps: [{ id: 'x', name: 'X', type, ...extra }] }));
		expect(codes()).toEqual([ValidationCode.SECRET_FORBIDDEN_STEP]);
		expect(issues[0].severity).toBe('error');
		expect(issues[0].message).toContain('API_TOKEN');
		expect(issues[0].message).toContain("'x'");
		expect(issues[0].suggestion).toContain('secrets: [API_TOKEN]');
	});

	it('forbids flow-level env referencing a secret', () => {
		validator.validateSecrets(flow({ env: { TOKEN: '${{ inputs.API_TOKEN }}', OK: 'x' }, steps: [script()] }));
		expect(codes()).toEqual([ValidationCode.SECRET_FORBIDDEN_STEP]);
		expect(issues[0].location?.field).toBe('env.TOKEN');
		expect(issues[0].message).toContain('every step');
	});

	it('does not flag non-secret inputs in model steps', () => {
		validator.validateSecrets(
			flow({
				inputs: { API_TOKEN: 'password', topic: 'string' },
				steps: [{ id: 'm', name: 'M', type: 'model', prompt: '${{ inputs.topic }}' }],
			})
		);
		expect(issues).toEqual([]);
	});

	it('warns when a script text references a secret', () => {
		validator.validateSecrets(flow({ steps: [script({ script: 'curl -H "X: ${{ inputs.API_TOKEN }}" u' })] }));
		expect(codes()).toEqual([ValidationCode.SECRET_IN_SCRIPT_TEXT]);
		expect(issues[0].severity).toBe('warning');
		expect(issues[0].suggestion).toContain('secrets: [API_TOKEN]');
		expect(issues[0].suggestion).toContain('$API_TOKEN');
	});

	it('does not warn for a secret referenced from a script env value', () => {
		validator.validateSecrets(flow({ steps: [script({ env: { T: '${{ inputs.API_TOKEN }}' } })] }));
		expect(issues).toEqual([]);
	});

	it('ignores steps that are not objects', () => {
		validator.validateSecrets(flow({ steps: [null, 'x'] }));
		expect(issues).toEqual([]);
	});
});
