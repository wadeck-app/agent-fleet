import { describe, expect, it } from 'vitest';

import { buildFlowGraph } from './FlowGraphBuilder.js';
import { BUILD_FLOW, COMPLETED_WITH_LOOP, FAILED_AT_TEST } from './RunFixtures.js';
import { annotateGraph } from './RunGraphAnnotation.js';

describe('annotateGraph', () => {
	it('adds the declared inputs, outputs and data-flow links to a definition drawn without a run', () => {
		const graph = annotateGraph(buildFlowGraph(BUILD_FLOW), BUILD_FLOW);
		const test = graph.nodes.find(node => node.id === 'test')!;

		expect(test.path).toBeUndefined();
		expect(test.io?.usesOutputOf.map(link => link.stepId)).toEqual(['implement']);
		expect(test.io?.usedBy.map(link => link.stepId)).toEqual(['ship', 'notify']);
		expect(graph.edges.every(edge => edge.traversed === undefined)).toBe(true);
	});

	it('adds the path of the run to every node and marks the edges that were followed', () => {
		const graph = annotateGraph(buildFlowGraph(BUILD_FLOW, COMPLETED_WITH_LOOP), BUILD_FLOW, COMPLETED_WITH_LOOP);
		const byId = Object.fromEntries(graph.nodes.map(node => [node.id, node.path]));

		expect(byId['plan']).toMatchObject({ outcome: 'ran', ordinal: 1 });
		expect(byId['notify']).toMatchObject({ outcome: 'skipped' });
		const traversed = (from: string, to: string) =>
			graph.edges.find(edge => edge.from === from && edge.to === to)!.traversed;
		expect(traversed('plan', 'implement')).toBe(true);
		expect(traversed('test', 'notify')).toBe(false);
		expect(traversed('test', 'implement')).toBe(true);
	});

	it('carries the recorded output of a failed step on its node', () => {
		const graph = annotateGraph(buildFlowGraph(BUILD_FLOW, FAILED_AT_TEST), BUILD_FLOW, FAILED_AT_TEST);

		expect(graph.nodes.find(node => node.id === 'test')!.io?.recorded.stderr?.text).toBe('Error: 3 tests failed');
	});

	it('annotates the injected steps of a run from the record alone', () => {
		const execution = {
			...COMPLETED_WITH_LOOP,
			steps: {
				...COMPLETED_WITH_LOOP.steps,
				extra: {
					status: 'completed' as const,
					injected: true,
					parent: 'deploy',
					startedAt: '2026-08-16T12:07:20.000Z',
					completedAt: '2026-08-16T12:07:30.000Z',
					stdout: 'x',
				},
			},
		};
		const graph = annotateGraph(buildFlowGraph(BUILD_FLOW, execution), BUILD_FLOW, execution);
		const extra = graph.nodes.find(node => node.id === 'extra')!;

		expect(extra.path?.outcome).toBe('ran');
		expect(extra.io?.declaredInputs).toEqual([]);
		expect(extra.io?.usedBy).toEqual([]);
	});
});
