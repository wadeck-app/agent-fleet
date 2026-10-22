const CHART_PAGE_PREFIX = '/modules/flow-chart/flows';

/** Where the chart of a flow definition lives (page of the manifest: /flows/:flowId under /modules/flow-chart). */
export function chartPathOfFlow(flowId: string): string {
	return `${CHART_PAGE_PREFIX}/${encodeURIComponent(flowId)}`;
}

/** Where the chart of one run lives (page of the manifest: /flows/runs/:id under /modules/flow-chart). */
export function chartPathOfExecution(executionId: string): string {
	return `${CHART_PAGE_PREFIX}/runs/${encodeURIComponent(executionId)}`;
}
