import { describe, expect, it } from 'vitest';

import { hashDefinition, shortHashOf } from './DefinitionHash.js';

describe('hashDefinition', () => {
	it('is a sha256 hex digest', () => {
		expect(hashDefinition({ id: 'a' })).toMatch(/^[0-9a-f]{64}$/);
	});

	it('ignores key order at every depth', () => {
		const a = { id: 'f', steps: [{ id: 's', type: 'script', env: { A: '1', B: '2' } }] };
		const b = { steps: [{ env: { B: '2', A: '1' }, type: 'script', id: 's' }], id: 'f' };
		expect(hashDefinition(a)).toBe(hashDefinition(b));
	});

	it('changes with the content, and keeps array order significant', () => {
		expect(hashDefinition({ steps: ['a', 'b'] })).not.toBe(hashDefinition({ steps: ['b', 'a'] }));
		expect(hashDefinition({ id: 'a' })).not.toBe(hashDefinition({ id: 'b' }));
	});

	it('shortens to 12 characters', () => {
		expect(shortHashOf(hashDefinition({ id: 'a' }))).toHaveLength(12);
	});
});
