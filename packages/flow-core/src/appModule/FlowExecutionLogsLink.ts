import { executionLogsPath } from './FlowModuleContract.js';

/** Query parameter of the flow module's logs page that preselects a step (its manifest urlParam `step`). */
export const FLOW_LOGS_STEP_PARAM = 'step';

/** The logs page of one run, optionally opened on one step: `/modules/flow/executions/<id>/logs?step=<stepId>`. */
export function executionStepLogsPath(executionId: string, stepId?: string): string {
	const base = executionLogsPath(executionId);
	return stepId === undefined ? base : `${base}?${FLOW_LOGS_STEP_PARAM}=${encodeURIComponent(stepId)}`;
}
