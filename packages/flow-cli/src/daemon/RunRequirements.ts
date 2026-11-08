import type { RunRequirementsRecord } from 'flow-core';
import { ProfileCatalog, RequirementSyntax } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine';

import { normaliseStepRequirements } from './RequirementMatcher.js';

/**
 * Resolves the requirements of a flow when the daemon ACCEPTS the run: the flow-level `requires` and the expansion of the
 * flow-level `profile` merged into each declared step's own (`requires` and `profile`). The result is recorded in the
 * execution record and used for every placement of the run, so editing the definition afterwards (or resuming) never
 * changes what a running execution requires.
 *
 * @returns undefined when nothing in the flow requires anything (nothing to record or enforce)
 * @throws when a `requires` is malformed or a `profile` is unknown. The validator already refuses such a flow, so this is
 *         the guard for a path that skipped it; the message names the flow or the step.
 */
export function resolveRunRequirements(flow: FlowDefinition): RunRequirementsRecord | undefined {
	const flowWhere = `Flow "${flow.id}"`;
	const run = [
		...new Set([
			...RequirementSyntax.normalise(flow.requires, flowWhere),
			...(flow.profile === undefined ? [] : ProfileCatalog.expand(flow.profile, flowWhere)),
		]),
	].sort();
	const steps = Object.fromEntries(
		flow.steps.map(step => [step.id, normaliseStepRequirements(run, step.requires, step.id, step.profile)])
	);
	const stepProfiles = Object.fromEntries(
		flow.steps.flatMap(step => (step.profile === undefined ? [] : [[step.id, step.profile] as const]))
	);
	const profiles =
		flow.profile === undefined && Object.keys(stepProfiles).length === 0
			? {}
			: { profiles: { ...(flow.profile === undefined ? {} : { run: flow.profile }), steps: stepProfiles } };
	const required = run.length > 0 || Object.values(steps).some(entries => entries.length > 0);
	return required ? { run, steps, ...profiles } : undefined;
}

/**
 * The requirements a step must find met, from the set recorded for its run. A declared step uses its recorded set; any
 * other step (one injected at run time) inherits the run's (flow `requires` and flow `profile`), plus its own `requires`
 * and `profile`, read at each placement.
 *
 * @throws when an injected step's `requires` is malformed or its `profile` unknown; the caller fails that step with this
 *         message.
 */
export function requirementsForStep(
	recorded: RunRequirementsRecord | undefined,
	stepId: string,
	stepRequires: unknown,
	stepProfile?: unknown
): string[] {
	const declared = recorded?.steps[stepId];
	if (declared !== undefined) {
		return declared;
	}
	return normaliseStepRequirements(recorded?.run ?? [], stepRequires, stepId, stepProfile);
}
