import { FLOW_CHART_APP_MODULE_ID } from './AppModuleIds.js';

// Pages of the flow-chart module (its manifest.json: /flows and /flows/runs/:id), for a module that links to them
// without importing it. app-module-flow-chart still holds its own copy (src/commons/ChartPaths.ts): it should switch to this one.
const FLOW_CHART_PAGE_PREFIX = `/modules/${FLOW_CHART_APP_MODULE_ID}/flows`;

/** The flow-chart index page (the list of flows with a chart). */
export const FLOW_CHART_INDEX_PATH = FLOW_CHART_PAGE_PREFIX;

/** Where the chart of one run lives. */
export function chartPathOfExecution(executionId: string): string {
	return `${FLOW_CHART_PAGE_PREFIX}/runs/${encodeURIComponent(executionId)}`;
}
