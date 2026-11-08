import type { RunRequirementsRecord } from 'flow-core';
import { RequirementSyntax } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine';

import { normaliseStepRequirements } from './RequirementMatcher.js';

/**
 * Resolves the requirements of a flow when the daemon ACCEPTS the run: the flow-level `requires` merged into each declared
 * step's own. The result is recorded in the execution record and used for every placement of the run, so editing the
 * definition afterwards (or resuming) never changes what a running execution requires.
 *
 * @returns undefined when nothing in the flow requires anything (nothing to record or enforce)
 * @throws when a `requires` is malformed. The validator already refuses such a flow, so this is the guard for a path that
 *         skipped it; the message names the flow or the step.
 */
export function resolveRunRequirements(flow: FlowDefinition): RunRequirementsRecord | undefined {
	const run = RequirementSyntax.normalise(flow.requires, `Flow "${flow.id}"`);
	const steps = Object.fromEntries(
		flow.steps.map(step => [step.id, normaliseStepRequirements(run, step.requires, step.id)])
	);
	const required = run.length > 0 || Object.values(steps).some(entries => entries.length > 0);
	return required ? { run, steps } : undefined;
}

/**
 * The requirements a step must find met, from the set recorded for its run. A declared step uses its recorded set; any
 * other step (one injected at run time) inherits the run's, plus its own `requires`, read at each placement.
 *
 * @throws when an injected step's `requires` is malformed; the caller fails that step with this message.
 */
export function requirementsForStep(
	recorded: RunRequirementsRecord | undefined,
	stepId: string,
	stepRequires: unknown
): string[] {
	const declared = recorded?.steps[stepId];
	if (declared !== undefined) {
		return declared;
	}
	return normaliseStepRequirements(recorded?.run ?? [], stepRequires, stepId);
}
