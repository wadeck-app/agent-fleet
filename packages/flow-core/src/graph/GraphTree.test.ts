import { describe, expect, it } from 'vitest';

import { FlowCoreError } from '../errors.js';
import type { FlowGraph, FlowGraphEdge, FlowGraphNode } from './FlowGraph.js';
import {
	DEFAULT_MAX_EXPANDED_CHILDREN,
	buildGraphTree,
	defaultCollapsedIds,
	liftEdges,
	visibleTreeRows,
} from './GraphTree.js';

function node(id: string): FlowGraphNode {
	return { id, kind: 'script', label: id };
}
const dep = (from: string, to: string): FlowGraphEdge => ({ from, to, kind: 'dependency' });
const sub = (child: string, parent: string): FlowGraphEdge => ({ from: child, to: parent, kind: 'substep' });

/**
 * plan -> build -> ship, where `build` was composed of b1 and b2 (b2 depends on b1) and b2 itself of b2a and b2b:
 * a sub-flow two levels deep. Nodes are deliberately not listed in dependency order (ship first).
 */
const NESTED: FlowGraph = {
	nodes: ['ship', 'b2b', 'plan', 'b2', 'build', 'b1', 'b2a'].map(node),
	edges: [
		dep('plan', 'build'),
		dep('build', 'ship'),
		sub('b1', 'build'),
		sub('b2', 'build'),
		dep('b1', 'b2'),
		sub('b2a', 'b2'),
		sub('b2b', 'b2'),
		dep('b2a', 'b2b'),
	],
};

describe('buildGraphTree', () => {
	it('lists a parent, then its sub-steps one level deeper, recursively; the top-level steps stay in dependency order', () => {
		const rows = buildGraphTree(NESTED);
		expect(rows.map(r => `${r.depth}:${r.nodeId}`)).toEqual([
			'0:plan',
			'0:build',
			'1:b1',
			'1:b2',
			'2:b2a',
			'2:b2b',
			'0:ship',
		]);
	});

	it('records the real parent, the direct child count and the number of descendants of each row', () => {
		const byId = new Map(buildGraphTree(NESTED).map(r => [r.nodeId, r]));
		expect(byId.get('plan')).toEqual({
			nodeId: 'plan',
			depth: 0,
			parentId: undefined,
			childCount: 0,
			descendantCount: 0,
		});
		expect(byId.get('build')).toMatchObject({ parentId: undefined, childCount: 2, descendantCount: 4 });
		expect(byId.get('b2')).toMatchObject({ parentId: 'build', childCount: 2, descendantCount: 2 });
		expect(byId.get('b2b')).toMatchObject({ parentId: 'b2', depth: 2, childCount: 0 });
	});

	it('orders siblings by their dependencies, keeping the graph order for independent ones', () => {
		const graph: FlowGraph = {
			nodes: ['p', 'c3', 'c1', 'c2'].map(node),
			edges: [sub('c3', 'p'), sub('c1', 'p'), sub('c2', 'p'), dep('c1', 'c3')],
		};
		expect(buildGraphTree(graph).map(r => r.nodeId)).toEqual(['p', 'c1', 'c3', 'c2']);
	});

	it('orders top-level steps by a dependency that goes through a sub-step (it counts for the step it belongs to)', () => {
		const graph: FlowGraph = {
			nodes: ['after', 'p', 'c'].map(node),
			edges: [sub('c', 'p'), dep('c', 'after')],
		};
		expect(buildGraphTree(graph).map(r => r.nodeId)).toEqual(['p', 'c', 'after']);
	});

	it('ignores loop edges for the order (they point backwards on purpose)', () => {
		const graph: FlowGraph = {
			nodes: ['a', 'b'].map(node),
			edges: [dep('a', 'b'), { from: 'b', to: 'a', kind: 'loop' }],
		};
		expect(buildGraphTree(graph).map(r => r.nodeId)).toEqual(['a', 'b']);
	});

	it('gives a graph without sub-steps one flat row per step', () => {
		const rows = buildGraphTree({ nodes: ['a', 'b'].map(node), edges: [dep('a', 'b')] });
		expect(rows.every(r => r.depth === 0 && r.parentId === undefined && r.childCount === 0)).toBe(true);
	});

	it('handles an empty graph', () => {
		expect(buildGraphTree({ nodes: [], edges: [] })).toEqual([]);
	});

	it('refuses a dependency cycle, naming the steps', () => {
		const graph: FlowGraph = { nodes: ['a', 'b'].map(node), edges: [dep('a', 'b'), dep('b', 'a')] };
		expect(() => buildGraphTree(graph)).toThrow(FlowCoreError);
		expect(() => buildGraphTree(graph)).toThrow(/dependency cycle.*a, b/);
	});

	it('refuses a sub-step cycle', () => {
		const graph: FlowGraph = { nodes: ['a', 'b'].map(node), edges: [sub('a', 'b'), sub('b', 'a')] };
		expect(() => buildGraphTree(graph)).toThrow(/sub-step cycle/);
	});

	it('refuses a step with two parents', () => {
		const graph: FlowGraph = {
			nodes: ['a', 'b', 'c'].map(node),
			edges: [sub('c', 'a'), sub('c', 'b')],
		};
		expect(() => buildGraphTree(graph)).toThrow(/'c' has two parents/);
	});

	it('refuses an edge to an unknown step', () => {
		const graph: FlowGraph = { nodes: [node('a')], edges: [dep('a', 'ghost')] };
		expect(() => buildGraphTree(graph)).toThrow(/ghost/);
	});
});

describe('defaultCollapsedIds', () => {
	const fan = (children: number): FlowGraph => ({
		nodes: ['p', ...Array.from({ length: children }, (_, i) => `c${i}`)].map(node),
		edges: Array.from({ length: children }, (_, i) => sub(`c${i}`, 'p')),
	});

	it('expands a parent with up to the limit of sub-steps and collapses one with more', () => {
		expect(DEFAULT_MAX_EXPANDED_CHILDREN).toBe(8);
		expect([...defaultCollapsedIds(buildGraphTree(fan(8)))]).toEqual([]);
		expect([...defaultCollapsedIds(buildGraphTree(fan(9)))]).toEqual(['p']);
	});

	it('takes the limit as a parameter', () => {
		expect([...defaultCollapsedIds(buildGraphTree(NESTED), 1)].sort()).toEqual(['b2', 'build']);
	});
});

describe('visibleTreeRows', () => {
	it('hides the whole subtree of a collapsed parent and keeps the parent', () => {
		const rows = visibleTreeRows(buildGraphTree(NESTED), new Set(['build']));
		expect(rows.map(r => r.nodeId)).toEqual(['plan', 'build', 'ship']);
	});

	it('hides only the sub-steps of a collapsed inner parent', () => {
		const rows = visibleTreeRows(buildGraphTree(NESTED), new Set(['b2']));
		expect(rows.map(r => r.nodeId)).toEqual(['plan', 'build', 'b1', 'b2', 'ship']);
	});
});

describe('liftEdges', () => {
	it('moves an edge end hidden in a collapsed parent to that parent, drops what becomes a self edge, and merges duplicates', () => {
		const rows = buildGraphTree(NESTED);
		const visible = new Set(visibleTreeRows(rows, new Set(['build'])).map(r => r.nodeId));
		expect(liftEdges(NESTED.edges, rows, visible)).toEqual([dep('plan', 'build'), dep('build', 'ship')]);
	});

	it('keeps the edges between visible steps as they are, in order', () => {
		const rows = buildGraphTree(NESTED);
		const all = new Set(rows.map(r => r.nodeId));
		expect(liftEdges(NESTED.edges, rows, all)).toEqual(NESTED.edges);
	});

	it('lifts a dependency from a hidden sub-step to the visible ancestor', () => {
		const graph: FlowGraph = {
			nodes: ['p', 'c', 'after'].map(node),
			edges: [sub('c', 'p'), dep('c', 'after')],
		};
		const rows = buildGraphTree(graph);
		expect(liftEdges(graph.edges, rows, new Set(['p', 'after']))).toEqual([dep('p', 'after')]);
	});
});
