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
 * @param implicit what the daemon adds to every model step on top of what the flow wrote (the `agent` profile when a worker
 *        source guaranteeing it is configured, see {@link ImplicitConfinement}); absent: nothing is added. Declared script steps never get it; steps injected later do (see {@link requirementsForStep}).
 * @returns undefined when nothing in the flow requires anything (nothing to record or enforce)
 * @throws when a `requires` is malformed or a `profile` is unknown. The validator already refuses such a flow, so this is
 *         the guard for a path that skipped it; the message names the flow or the step.
 */
export function resolveRunRequirements(
	flow: FlowDefinition,
	implicit: readonly string[] = []
): RunRequirementsRecord | undefined {
	const flowWhere = `Flow "${flow.id}"`;
	const run = [
		...new Set([
			...RequirementSyntax.normalise(flow.requires, flowWhere),
			...(flow.profile === undefined ? [] : ProfileCatalog.expand(flow.profile, flowWhere)),
		]),
	].sort();
	const implicitSteps: string[] = [];
	const steps = Object.fromEntries(
		flow.steps.map(step => {
			const declared = normaliseStepRequirements(run, step.requires, step.id, step.profile);
			if (step.type !== MODEL_STEP_TYPE || implicit.length === 0) {
				return [step.id, declared];
			}
			// A step that already requires the whole set gets nothing implicit (and is not listed as such).
			if (implicit.every(entry => declared.includes(entry))) {
				return [step.id, declared];
			}
			implicitSteps.push(step.id);
			return [step.id, [...new Set([...declared, ...implicit])].sort()];
		})
	);
	const stepProfiles = Object.fromEntries(
		flow.steps.flatMap(step => (step.profile === undefined ? [] : [[step.id, step.profile] as const]))
	);
	const profiles =
		flow.profile === undefined && Object.keys(stepProfiles).length === 0
			? {}
			: { profiles: { ...(flow.profile === undefined ? {} : { run: flow.profile }), steps: stepProfiles } };
	// Recorded as soon as the flow has a model step (the only kind that can inject steps), even when every one of them already
	// requires the set: a step injected later inherits it from this record. A flow without model step records nothing.
	const implicitRecord =
		implicit.length > 0 && flow.steps.some(step => step.type === MODEL_STEP_TYPE)
			? { implicit: { requires: [...new Set(implicit)].sort(), steps: implicitSteps } }
			: {};
	const required = run.length > 0 || Object.values(steps).some(entries => entries.length > 0);
	return required ? { run, steps, ...profiles, ...implicitRecord } : undefined;
}

/** The step type of a model step: the only one the implicit confinement applies to. */
export const MODEL_STEP_TYPE = 'model';

/**
 * The requirements a step must find met, from the set recorded for its run. A declared step uses its recorded set; any
 * other step (one injected at run time) inherits the run's (flow `requires` and flow `profile`), plus its own `requires`
 * and `profile`, read at each placement.
 *
 * An injected step of ANY type (script included) also gets the implicit set the record holds (`recorded.implicit`): code the
 * agent adds while the flow runs must stay where the agent is confined. The record decides, never the current machine; a run
 * recorded without implicit set adds nothing. Steps of the flow definition keep their recorded set (scripts: none implicit).
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
	const own = normaliseStepRequirements(recorded?.run ?? [], stepRequires, stepId, stepProfile);
	if (recorded?.implicit === undefined) {
		return own;
	}
	return [...new Set([...own, ...recorded.implicit.requires])].sort();
}
