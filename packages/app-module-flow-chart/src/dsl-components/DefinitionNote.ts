import type { FlowGraphResult } from 'flow-core';

/**
 * Where the drawn definition of a run comes from, for the chart header; undefined when the graph is not about a run.
 * A run that recorded its definition is drawn from it (edges are the real ones); an older run is drawn from the flow
 * file as it is now, and the chart may then warn that steps changed.
 */
export function definitionNoteOf({
	definition,
	execution,
}: Pick<FlowGraphResult, 'definition' | 'execution'>): string | undefined {
	if (execution === undefined) {
		return undefined;
	}
	return definition.source === 'recorded'
		? `definition v${definition.version} as it ran`
		: 'definition read from the flow file as it is now (this run predates flow versions)';
}
