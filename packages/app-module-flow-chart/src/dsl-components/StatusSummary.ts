import type { FlowGraph } from 'flow-core';

import { STATUS_LEGEND } from './StatusStyle.js';

/**
 * "4 steps: 1 completed, 1 failed, 2 pending". Statuses with no step are left out; a graph without step
 * states (a definition alone) is only counted.
 */
export function summarizeStatuses(graph: FlowGraph): string {
	const total = graph.nodes.length;
	const noun = total === 1 ? 'step' : 'steps';
	if (graph.nodes.every(node => node.status === undefined)) {
		return `${total} ${noun}`;
	}
	const parts = STATUS_LEGEND.map(status => ({
		status,
		count: graph.nodes.filter(node => node.status === status).length,
	}))
		.filter(entry => entry.count > 0)
		.map(entry => `${entry.count} ${entry.status}`);
	return `${total} ${noun}: ${parts.join(', ')}`;
}
