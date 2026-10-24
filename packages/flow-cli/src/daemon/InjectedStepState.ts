import type { StepState } from 'flow-core';

import type { InjectedStep } from '../ipc/Protocol.js';

/**
 * Initial execution-record entry of a step injected at run time (provideSteps). The dependencies and parent are
 * recorded so a reader (the flow chart) can draw the step's edges: they exist nowhere else once the run is over.
 */
export function injectedStepState(step: InjectedStep): StepState {
	return {
		status: 'pending',
		injected: true,
		...(step.depends && step.depends.length > 0 ? { dependsOn: [...step.depends] } : {}),
		...(step.parent !== undefined ? { parent: step.parent } : {}),
		...(typeof step.wave === 'number' ? { wave: step.wave } : {}),
	};
}
