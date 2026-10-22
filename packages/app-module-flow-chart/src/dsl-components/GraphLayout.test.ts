import { describe, expect, it } from 'vitest';

import { INDENT, NODE_HEIGHT, NODE_WIDTH, ROW_PITCH, layoutGraph, layoutTree } from './GraphLayout.js';
import { BUILD_GRAPH, SUBFLOW_GRAPH, chain, node } from './testing/GraphFixtures.js';

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

describe('layoutGraph with sub-steps', () => {
	for (const direction of ['TB', 'LR'] as const) {
		describe(direction, () => {
			it('puts the sub-steps under their parent, one indent per level, in tree order, without overlap', () => {
				const p = layoutGraph(SUBFLOW_GRAPH, direction);
				const build = p.get('build')!;
				expect(p.get('b1')!.x).toBe(build.x + INDENT);
				expect(p.get('b2')!.x).toBe(build.x + INDENT);
				expect(p.get('b2a')!.x).toBe(build.x + 2 * INDENT);
				expect(p.get('b2b')!.x).toBe(build.x + 2 * INDENT);
				const column = ['build', 'b1', 'b2', 'b2a', 'b2b'].map(id => p.get(id)!.y);
				expect(column).toEqual([0, 1, 2, 3, 4].map(i => build.y + i * ROW_PITCH));
				expect(ROW_PITCH).toBeGreaterThan(NODE_HEIGHT);
			});

			it('keeps the top-level steps on one spine, aligned and in dependency order', () => {
				const p = layoutGraph(SUBFLOW_GRAPH, direction);
				if (direction === 'TB') {
					expect(p.get('plan')!.x).toBe(p.get('build')!.x);
					expect(p.get('ship')!.x).toBe(p.get('build')!.x);
					// ship starts below the last sub-step of build.
					expect(p.get('ship')!.y).toBeGreaterThanOrEqual(p.get('b2b')!.y + NODE_HEIGHT);
					expect(p.get('plan')!.y + NODE_HEIGHT).toBeLessThanOrEqual(p.get('build')!.y);
				} else {
					expect(p.get('build')!.x).toBeGreaterThanOrEqual(p.get('plan')!.x + NODE_WIDTH);
					expect(p.get('ship')!.x).toBeGreaterThanOrEqual(p.get('build')!.x + NODE_WIDTH + 2 * INDENT);
				}
			});

			it('leaves out the sub-steps of a collapsed parent', () => {
				const p = layoutGraph(SUBFLOW_GRAPH, direction, new Set(['build']));
				expect([...p.keys()].sort()).toEqual(['build', 'plan', 'ship']);
			});

			it('leaves out only what is under a collapsed inner parent', () => {
				const p = layoutGraph(SUBFLOW_GRAPH, direction, new Set(['b2']));
				expect([...p.keys()].sort()).toEqual(['b1', 'b2', 'build', 'plan', 'ship']);
			});
		});
	}
});

describe('layoutTree', () => {
	it('returns the visible rows and the edges redrawn on the visible steps', () => {
		const tree = layoutTree(SUBFLOW_GRAPH, 'TB', new Set(['build']));
		expect(tree.rows.map(r => r.nodeId)).toEqual(['plan', 'build', 'ship']);
		expect(tree.edges.map(e => `${e.from}>${e.to}`)).toEqual(['plan>build', 'build>ship']);
	});
});
