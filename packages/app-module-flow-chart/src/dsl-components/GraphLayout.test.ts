import { describe, expect, it } from 'vitest';

import { NODE_HEIGHT, NODE_WIDTH, layoutGraph } from './GraphLayout.js';
import { BUILD_GRAPH, chain, node } from './testing/GraphFixtures.js';

describe('layoutGraph', () => {
	it('puts a dependency to the right of what it depends on (LR), every node at its own spot', () => {
		const positions = layoutGraph(BUILD_GRAPH, 'LR');
		expect(positions.get('test')!.x).toBeGreaterThan(positions.get('plan')!.x + NODE_WIDTH - 1);
		expect(positions.get('ship')!.x).toBeGreaterThan(positions.get('test')!.x);
		const spots = new Set([...positions.values()].map(p => `${p.x},${p.y}`));
		expect(spots.size).toBe(BUILD_GRAPH.nodes.length);
	});

	it('puts a dependency below what it depends on (TB)', () => {
		const positions = layoutGraph(BUILD_GRAPH, 'TB');
		expect(positions.get('test')!.y).toBeGreaterThan(positions.get('plan')!.y + NODE_HEIGHT - 1);
	});

	it('ignores loop edges for the ranking: a retry loop must not flip the flow backwards', () => {
		const positions = layoutGraph(BUILD_GRAPH, 'LR');
		expect(positions.get('plan')!.x).toBeLessThan(positions.get('test')!.x);
	});

	it('handles a single step', () => {
		const positions = layoutGraph({ nodes: [node('only')], edges: [] }, 'LR');
		expect([...positions.keys()]).toEqual(['only']);
	});

	it('handles an empty graph', () => {
		expect(layoutGraph({ nodes: [], edges: [] }, 'LR').size).toBe(0);
	});

	it('handles 50 steps without overlap', () => {
		const positions = layoutGraph(chain(50), 'TB');
		expect(positions.size).toBe(50);
		const ys = [...positions.values()].map(p => p.y).sort((a, b) => a - b);
		for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(NODE_HEIGHT);
	});

	it('refuses an edge to an unknown step with a message naming it (flow-core should have refused it first)', () => {
		expect(() =>
			layoutGraph({ nodes: [node('a')], edges: [{ from: 'a', to: 'ghost', kind: 'dependency' }] }, 'LR')
		).toThrow(/ghost/);
	});
});
