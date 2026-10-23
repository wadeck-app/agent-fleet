import { describe, expect, it } from 'vitest';

import { loadDslKeyCheck } from './DslKeyCheck.js';

describe('loadDslKeyCheck', () => {
	it('loads the walker and the key list of the installed dsl-ui, which knows AbTest', async () => {
		const { findUnknownKeys, knownKeys } = await loadDslKeyCheck();
		expect(knownKeys).toHaveProperty('AbTest');
		expect(findUnknownKeys({ $type: 'Link', href: '/x', label: 'x' }, knownKeys)).toEqual([]);
	});

	it('reports a key the component does not read, as an error with its node path', async () => {
		const { findUnknownKeys, knownKeys } = await loadDslKeyCheck();
		const found = findUnknownKeys({ $type: 'Link', href: '/x', label: 'x', nonsense: 1 }, knownKeys);
		expect(
			found
				.filter(d => d.severity === 'error')
				.map(d => d.message)
				.join('\n')
		).toContain('nonsense');
	});
});
