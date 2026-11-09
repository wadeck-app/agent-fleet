import type { StepPlacement } from 'extension-points';

import type { ExecutionRegistry } from './ExecutionRegistry.js';
import { assertStepLabels } from './LabelMatcher.js';
import type { ReadyStep } from './ReadyStepQueue.js';
import { requirementsForStep } from './RunRequirements.js';

/** Describes a step for routing, from the step and from what the execution holds for its run. */
export class StepPlacementBuilder {
	constructor(private readonly executions: ExecutionRegistry) {}

	/**
	 * @throws when the step's `labels` or `requires` are malformed. Schema validation already refuses such a flow before it
	 *         starts (D#7), so this covers the path that skips it -- a step injected at runtime. Reported as a step
	 *         failure by the caller, because an unmatchable set means no worker is ever eligible and presenting that as
	 *         "waiting for capacity" would hide the mistake forever.
	 */
	describe(step: ReadyStep): StepPlacement {
		const labels = (step.stepConfig as { labels?: unknown }).labels;
		assertStepLabels(labels, step.stepId);
		// Only `type: script` steps carry `shell:` (Proposal 1); every other step type has
		// no such field, which `workerSatisfiesShell` already treats as "no constraint".
		const shellKind = (step.stepConfig as { shell?: 'bash' | 'cmd' | 'pwsh' }).shell;
		const { executionId } = step.executionContext;
		const project = this.executions.projectOf(executionId);
		// Read per placement, from the execution and not from the step: a step injected later carries none of the flow's
		// fields, and the requirements must hold for it too. They are the ones recorded when the run was accepted, never
		// resolved again from the definition.
		const requires = requirementsForStep(
			this.executions.requirementsOf(executionId),
			step.stepId,
			(step.stepConfig as { requires?: unknown }).requires,
			(step.stepConfig as { profile?: unknown }).profile,
			step.stepConfig.type
		);
		const workspaceKind = this.executions.workspaceKindOf(executionId);
		return {
			stepId: step.stepId,
			labels: labels ?? [],
			// The step type is the only signal for this: there is no step-level
			// `interactive` field, by design (D#60).
			requiresUserInterface: step.stepConfig.type === 'user_intervention',
			...(project !== undefined ? { projectId: project.projectId, projectRoot: project.projectRoot } : {}),
			...(shellKind !== undefined ? { shellKind } : {}),
			...(requires.length > 0 ? { requires } : {}),
			...(workspaceKind !== undefined ? { workspaceKind } : {}),
		};
	}
}
