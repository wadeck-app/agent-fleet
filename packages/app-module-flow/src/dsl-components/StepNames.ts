import { RUN_EVENTS_STEP } from './LogStreamProps.js';

/** What the page calls the lines about the run itself. */
export const RUN_EVENTS_LABEL = 'Run events';

/** The name to show for a step id: the run events have a readable name instead of the internal id. */
export function displayStepName(stepId: string): string {
	return stepId === RUN_EVENTS_STEP ? RUN_EVENTS_LABEL : stepId;
}

/** `#3 plan`, or the name alone for a step without execution order. */
export function orderedName(stepId: string, order: number | null): string {
	return order === null ? displayStepName(stepId) : `#${order} ${displayStepName(stepId)}`;
}
