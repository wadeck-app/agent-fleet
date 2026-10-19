import { describe, expect, it } from 'vitest';

import { NODE_HEIGHT, NODE_WIDTH } from './GraphLayout.js';
import { toFlowElements } from './ToFlowElements.js';
import { BUILD_GRAPH, node } from './testing/GraphFixtures.js';

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
