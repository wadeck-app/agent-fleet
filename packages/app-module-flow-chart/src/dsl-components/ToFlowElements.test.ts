import { describe, expect, it } from 'vitest';

import { INDENT, NODE_HEIGHT, NODE_WIDTH } from './GraphLayout.js';
import { toFlowElements } from './ToFlowElements.js';
import { BUILD_GRAPH, SUBFLOW_GRAPH, node } from './testing/GraphFixtures.js';

describe('toFlowElements', () => {
	it('makes one fixed-size step node per step, selected only when asked', () => {
		const { nodes } = toFlowElements(BUILD_GRAPH, 'LR', 'test');
		expect(nodes.map(n => n.id)).toEqual(['plan', 'test', 'ship', 'notify']);
		expect(nodes.every(n => n.type === 'step' && n.width === NODE_WIDTH && n.height === NODE_HEIGHT)).toBe(true);
		expect(nodes.filter(n => n.selected).map(n => n.id)).toEqual(['test']);
	});

	it('hands the step and the direction to the node component', () => {
		const { nodes } = toFlowElements(BUILD_GRAPH, 'TB', undefined);
		expect(nodes[0]!.data).toMatchObject({ direction: 'TB', step: { id: 'plan' } });
	});

	it('draws the loop between the loop handles so it curves around instead of crossing the flow', () => {
		const { edges } = toFlowElements(BUILD_GRAPH, 'LR', undefined);
		const loop = edges.find(e => e.id.startsWith('loop:'))!;
		expect(loop).toMatchObject({
			source: 'test',
			target: 'plan',
			sourceHandle: 'loop-out',
			targetHandle: 'loop-in',
			animated: true,
			// Routed well clear of the nodes: a bezier between two bottom handles runs flat along the node borders.
			pathOptions: { offset: 36, borderRadius: 14 },
		});
		expect(loop.label).toBe('on failure (max 2x)');
		const dependency = edges.find(e => e.id === 'dependency:plan->test')!;
		expect(dependency.sourceHandle).toBe('out');
		expect(dependency.targetHandle).toBe('in');
	});

	it('dashes a conditional edge and labels it with the condition', () => {
		const { edges } = toFlowElements(BUILD_GRAPH, 'LR', undefined);
		const conditional = edges.find(e => e.id.startsWith('conditional:'))!;
		expect(conditional.label).toBe('steps.test.failed');
		expect(conditional.style?.strokeDasharray).toBe('6 4');
	});

	it('gives every edge a unique id, even for parallel edges of different kinds', () => {
		const graph = {
			nodes: [node('a'), node('b')],
			edges: [
				{ from: 'a', to: 'b', kind: 'dependency' as const },
				{ from: 'a', to: 'b', kind: 'loop' as const },
			],
		};
		const ids = toFlowElements(graph, 'LR', undefined).edges.map(e => e.id);
		expect(new Set(ids).size).toBe(2);
	});
});

describe('toFlowElements with sub-steps', () => {
	it('puts a sub-step under its parent and tells the node its depth and its sub-steps', () => {
		const { nodes } = toFlowElements(SUBFLOW_GRAPH, 'TB', undefined);
		const byId = new Map(nodes.map(n => [n.id, n]));
		expect(byId.get('b1')!.position.x).toBe(byId.get('build')!.position.x + INDENT);
		expect(byId.get('build')!.data.tree).toEqual({ depth: 0, childCount: 2, collapsed: false, toggleable: false });
		expect(byId.get('b2a')!.data.tree).toMatchObject({ depth: 2, childCount: 0 });
	});

	it('draws a sub-step link from the parent down to the sub-step, without an arrow head, between the tree handles', () => {
		const { edges } = toFlowElements(SUBFLOW_GRAPH, 'TB', undefined);
		const link = edges.find(e => e.id === 'substep:b1->build')!;
		expect(link).toMatchObject({
			source: 'build',
			target: 'b1',
			sourceHandle: 'tree-out',
			targetHandle: 'tree-in',
		});
		expect(link.markerEnd).toBeUndefined();
	});

	it('links stacked neighbours bottom to top, and routes any other dependency of a sub-step around the left side', () => {
		const { edges } = toFlowElements(SUBFLOW_GRAPH, 'TB', undefined);
		// b2a is the row right before b2b.
		expect(edges.find(e => e.id === 'dependency:b2a->b2b')).toMatchObject({
			sourceHandle: 'stack-out',
			targetHandle: 'stack-in',
		});
		// b1 -> b2 is not neighbours (nothing between them, but b2 follows b1: it is the next row).
		expect(edges.find(e => e.id === 'dependency:b1->b2')).toMatchObject({
			sourceHandle: 'stack-out',
			targetHandle: 'stack-in',
		});
	});

	it('leaves a step with sub-steps by the left side in a vertical chart, so its edge does not cross them', () => {
		const { edges } = toFlowElements(SUBFLOW_GRAPH, 'TB', undefined);
		expect(edges.find(e => e.id === 'dependency:build->ship')).toMatchObject({
			sourceHandle: 'side-out',
			targetHandle: 'side-in',
		});
		expect(edges.find(e => e.id === 'dependency:plan->build')).toMatchObject({
			sourceHandle: 'out',
			targetHandle: 'in',
		});
	});

	it('keeps the usual right/left handles for the spine in a horizontal chart', () => {
		const { edges } = toFlowElements(SUBFLOW_GRAPH, 'LR', undefined);
		expect(edges.find(e => e.id === 'dependency:build->ship')).toMatchObject({
			sourceHandle: 'out',
			targetHandle: 'in',
		});
	});

	it('hides the sub-steps of a collapsed parent and redraws their edges on it', () => {
		const { nodes, edges } = toFlowElements(SUBFLOW_GRAPH, 'TB', undefined, {
			collapsed: new Set(['build']),
			onToggle: () => {},
		});
		expect(nodes.map(n => n.id)).toEqual(['plan', 'build', 'ship']);
		expect(nodes[1]!.data.tree).toEqual({ depth: 0, childCount: 2, collapsed: true, toggleable: true });
		expect(edges.map(e => e.id)).toEqual(['dependency:plan->build', 'dependency:build->ship']);
		expect(edges[1]).toMatchObject({ sourceHandle: 'out', targetHandle: 'in' });
	});

	it('passes the toggle to the nodes that have sub-steps', () => {
		const calls: string[] = [];
		const { nodes } = toFlowElements(SUBFLOW_GRAPH, 'TB', undefined, {
			collapsed: new Set(),
			onToggle: id => calls.push(id),
		});
		nodes.find(n => n.id === 'build')!.data.onToggleCollapse!('build');
		expect(calls).toEqual(['build']);
		expect(nodes.find(n => n.id === 'plan')!.data.tree.toggleable).toBe(false);
	});
});
