/**
 * The two things a chart can show, in the words the header and the legend both use: the structure of a flow file
 * alone (no run), or the steps of one run with their status.
 */
export function describeChartMode(execution: { executionId: string } | undefined): { title: string; hint: string } {
	if (execution === undefined) {
		return {
			title: 'Flow structure (no run selected)',
			hint: 'The steps as written in the flow file. Nothing ran, so steps have no status. Open a run to see how it went.',
		};
	}
	return { title: `Run ${execution.executionId}`, hint: 'The steps of this run, with the status of each step.' };
}
