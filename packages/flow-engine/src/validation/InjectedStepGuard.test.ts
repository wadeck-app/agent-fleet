import { describe, expect, it } from 'vitest';

import { InjectedStepGuard } from './InjectedStepGuard';

const script = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	id: 'a',
	type: 'script',
	script: 'ls',
	...extra,
});

describe('InjectedStepGuard', () => {
	it('accepts the steps the provideSteps tool advertises', () => {
		expect(
			InjectedStepGuard.find([
				script({ name: 'n', parent: 'p', depends: ['x'], wave: 1, env: { A: 'b' }, onFailure: { goto: 'a' } }),
				{ id: 'm', type: 'model', model: 'haiku', prompt: 'p', tools: ['read'], provider: 'x', timeout: 5 },
			])
		).toEqual([]);
	});

	it('accepts every allowlisted key', () => {
		const step: Record<string, unknown> = { id: 'a', type: 'script' };
		for (const key of InjectedStepGuard.ALLOWED_KEYS) {
			step[key] = key === 'steps' || key === 'subSteps' ? [] : 'v';
		}
		step['type'] = 'script';
		expect(InjectedStepGuard.find([step])).toEqual([]);
	});

	it.each([
		'mcpServers',
		'toolHooks',
		'permission',
		'onCompact',
		'workingDir',
		'shell',
		'secrets',
		'labels',
		'flowId',
		'session',
		'whatever',
	])('refuses the key %s, naming step and key', key => {
		const found = InjectedStepGuard.find([script({ [key]: 'x' })]);
		expect(found).toEqual([{ stepId: 'a', path: 'a', problem: `key \`${key}\`` }]);
	});

	it('refuses skipPermissions: true but accepts skipPermissions: false', () => {
		expect(InjectedStepGuard.find([script({ skipPermissions: true })])).toHaveLength(1);
		expect(InjectedStepGuard.find([script({ skipPermissions: 'true' })])).toHaveLength(1);
		expect(InjectedStepGuard.find([script({ skipPermissions: false })])).toEqual([]);
	});

	it('leaves host to the dedicated guard', () => {
		expect(InjectedStepGuard.find([script({ host: true }), script({ host: false })])).toEqual([]);
	});

	it.each([
		['missing', undefined],
		['a number', 3],
		['Model', 'Model'],
		['subflow', 'subflow'],
		['empty', ''],
	])('refuses a type that is %s', (_label, type) => {
		const step: Record<string, unknown> = { id: 'a', script: 'ls' };
		if (type !== undefined) {
			step['type'] = type;
		}
		const found = InjectedStepGuard.find([step]);
		expect(found).toHaveLength(1);
		expect(found[0]!.problem).toMatch(/^type /);
	});

	it('walks steps and subSteps at any depth and reports the path', () => {
		const found = InjectedStepGuard.find([
			script({
				id: 'outer',
				steps: [script({ id: 'mid', subSteps: [script({ id: 'deep', mcpServers: {} })] })],
			}),
		]);
		expect(found).toEqual([{ stepId: 'deep', path: 'outer > mid > deep', problem: 'key `mcpServers`' }]);
	});

	it('reports every problem of a step', () => {
		const found = InjectedStepGuard.find([{ id: 'a', type: 'subflow', toolHooks: {}, shell: 'x' }]);
		expect(found.map(f => f.problem)).toEqual(['type "subflow"', 'key `toolHooks`', 'key `shell`']);
	});

	it('refusal names steps, problems, the allowlist and where privileged settings belong', () => {
		const message = InjectedStepGuard.refusal([
			{ stepId: 'deep', path: 'outer > deep', problem: 'key `mcpServers`' },
		]);
		expect(message).toContain("'deep' (outer > deep): key `mcpServers`");
		expect(message).toContain('may only carry');
		for (const key of InjectedStepGuard.ALLOWED_KEYS) {
			expect(message).toContain(key);
		}
		expect(message).toMatch(
			/mcpServers, toolHooks, hostTools, permission mode, working directory.*flow definition/s
		);
	});
});

// A model steered by hostile content must not widen its own reach: hostTools belongs to the flow definition (design D6).
describe('InjectedStepGuard - hostTools is never injectable', () => {
	const HOST_TOOLS = [{ id: 't', description: 'd', sideEffect: 'read', command: ['x'] }];

	it('does not list hostTools among the allowed keys', () => {
		expect(InjectedStepGuard.ALLOWED_KEYS).not.toContain('hostTools');
	});

	it.each([
		['a script step', script({ hostTools: HOST_TOOLS }), 'a'],
		['a model step', { id: 'm', type: 'model', prompt: 'p', hostTools: HOST_TOOLS }, 'm'],
		['an empty list', script({ hostTools: [] }), 'a'],
		['a null value', script({ hostTools: null }), 'a'],
	])('refuses the batch when %s carries hostTools at depth 1', (_label, step, id) => {
		expect(InjectedStepGuard.find([step])).toEqual([{ stepId: id, path: id, problem: 'key `hostTools`' }]);
	});

	it.each([
		['steps', 'outer > mid > deep'],
		['subSteps', 'outer > mid > deep'],
	])('refuses hostTools nested under %s, reporting the path', (nestedKey, path) => {
		const found = InjectedStepGuard.find([
			script({
				id: 'outer',
				[nestedKey]: [script({ id: 'mid', [nestedKey]: [script({ id: 'deep', hostTools: HOST_TOOLS })] })],
			}),
		]);
		expect(found).toEqual([{ stepId: 'deep', path, problem: 'key `hostTools`' }]);
	});

	it('names hostTools among the privileged settings in the refusal, so the model knows where it belongs', () => {
		const message = InjectedStepGuard.refusal([{ stepId: 'a', path: 'a', problem: 'key `hostTools`' }]);
		expect(message).toMatch(/Privileged settings \([^)]*hostTools[^)]*\) belong to the flow definition/);
	});

	it('refuses a batch where only one of several steps carries hostTools', () => {
		const found = InjectedStepGuard.find([script({ id: 'ok' }), script({ id: 'bad', hostTools: HOST_TOOLS })]);
		expect(found.map(entry => entry.stepId)).toEqual(['bad']);
	});
});

describe('InjectedStepGuard.ALLOWED_TYPES', () => {
	it('is script and model only', () => {
		expect(InjectedStepGuard.ALLOWED_TYPES).toEqual(['script', 'model']);
	});
});
