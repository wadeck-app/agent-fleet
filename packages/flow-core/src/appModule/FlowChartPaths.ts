import { FLOW_CHART_APP_MODULE_ID } from './AppModuleIds.js';

// Pages of the flow-chart module (its manifest.json: /flows and /flows/runs/:id), for a module that links to them
// without importing it (and used by the flow-chart module itself).
const FLOW_CHART_PAGE_PREFIX = `/modules/${FLOW_CHART_APP_MODULE_ID}/flows`;

/** The flow-chart index page (the list of flows with a chart). */
export const FLOW_CHART_INDEX_PATH = FLOW_CHART_PAGE_PREFIX;

/** Where the chart of one run lives. */
export function chartPathOfExecution(executionId: string): string {
	return `${FLOW_CHART_PAGE_PREFIX}/runs/${encodeURIComponent(executionId)}`;
}

/** Where the chart of a flow definition lives (page of the manifest: /flows/:flowId). */
export function chartPathOfFlow(flowId: string): string {
	return `${FLOW_CHART_PAGE_PREFIX}/${encodeURIComponent(flowId)}`;
}
