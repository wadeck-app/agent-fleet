import { describe, expect, it } from 'vitest';

import { isFlowPlugin } from './FlowPlugin';

describe('isFlowPlugin', () => {
	it('accepts an object with an extension point and an async create function', () => {
		expect(isFlowPlugin({ extensionPoint: 'worker-type', create: async () => ({ dispose: async () => {} }) })).toBe(true);
	});

	it.each([
		['null', null],
		['a string', 'plugin'],
		['no create', { extensionPoint: 'worker-type' }],
		['create is not a function', { extensionPoint: 'worker-type', create: 'x' }],
		['no extension point', { create: async () => ({}) }],
		['empty extension point', { extensionPoint: '', create: async () => ({}) }],
	])('rejects %s', (_label, value) => {
		expect(isFlowPlugin(value)).toBe(false);
	});
});
