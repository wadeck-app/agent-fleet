import type { FlowGraph } from 'flow-core';
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
		expect(pickFocusStep(graph, 'TB')).toBe('b');
	});

	it('falls back to the first running step, then to the first step', () => {
		expect(
			pickFocusStep(
				{ nodes: [node('a', { status: 'completed' }), node('b', { status: 'running' })], edges: [] },
				'TB'
			)
		).toBe('b');
		expect(pickFocusStep(chain(3), 'TB')).toBe(chain(3).nodes[0]!.id);
	});

	it('falls back to the entry step of the layout (first along the flow), not the first node of the list', () => {
		// "leaf" is listed first but sits last in the flow: the entry is "root".
		const graph: FlowGraph = {
			nodes: [node('leaf'), node('mid'), node('root')],
			edges: [
				{ from: 'root', to: 'mid', kind: 'dependency' },
				{ from: 'mid', to: 'leaf', kind: 'dependency' },
			],
		};
		expect(pickFocusStep(graph, 'TB')).toBe('root');
		expect(pickFocusStep(graph, 'LR')).toBe('root');
	});

	it('fails loudly on an empty graph', () => {
		expect(() => pickFocusStep({ nodes: [], edges: [] }, 'TB')).toThrow(/no step/);
	});
});

describe('pickFocusStep with collapsed parents', () => {
	it('never picks a step hidden in a collapsed parent', () => {
		const graph: FlowGraph = {
			nodes: [node('p', { status: 'running' }), node('c', { status: 'failed' })],
			edges: [{ from: 'c', to: 'p', kind: 'substep' }],
		};
		expect(pickFocusStep(graph, 'TB')).toBe('c');
		expect(pickFocusStep(graph, 'TB', new Set(['p']))).toBe('p');
	});
});
