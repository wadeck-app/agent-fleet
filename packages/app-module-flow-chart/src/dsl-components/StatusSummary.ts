import type { FlowGraph } from 'flow-core';

import { PATH_LEGEND, nodeStyle } from './NodeAppearance.js';
import { STATUS_LEGEND } from './StatusStyle.js';

// A skipped or never reached step is counted as such, not under the status the record gave it (completed, pending).
const LABELS: readonly string[] = [...STATUS_LEGEND, ...PATH_LEGEND.map(style => style.label)];

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
	const parts = LABELS.map(label => ({
		label,
		count: graph.nodes.filter(node => nodeStyle(node).label === label).length,
	}))
		.filter(entry => entry.count > 0)
		.map(entry => `${entry.count} ${entry.label}`);
	return `${total} ${noun}: ${parts.join(', ')}`;
}
