import { describe, expect, it } from 'vitest';

import { pickFocusStep } from './FocusStep.js';
import { chain, node } from './testing/GraphFixtures.js';

describe('pickFocusStep', () => {
	it('focuses the first failed step, the one a reader looks for', () => {
		const graph = {
			nodes: [
				node('a', { status: 'completed' }),
				node('b', { status: 'failed' }),
				node('c', { status: 'running' }),
			],
			edges: [],
		};
		expect(pickFocusStep(graph)).toBe('b');
	});

	it('falls back to the first running step, then to the first step', () => {
		expect(
			pickFocusStep({ nodes: [node('a', { status: 'completed' }), node('b', { status: 'running' })], edges: [] })
		).toBe('b');
		expect(pickFocusStep(chain(3))).toBe(chain(3).nodes[0]!.id);
	});

	it('fails loudly on an empty graph', () => {
		expect(() => pickFocusStep({ nodes: [], edges: [] })).toThrow(/no step/);
	});
});
