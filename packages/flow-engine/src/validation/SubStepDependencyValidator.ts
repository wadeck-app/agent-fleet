/**
 * Sub-Step Dependency Validator
 *
 * Warns when a sub-step (`parent:`) depends on a sibling sub-step of the same parent while the parent
 * uses the `wait-all` strategy. In that case a failed sibling leaves the dependent settled as "not run",
 * so the parent never sees its feedback in the same round.
 *
 * Non-fatal: the flow still runs, the warning only explains the behaviour.
 */
import type { FlowDefinition } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/** Default strategy of a parent that does not declare `subStepStrategy` (see FlowScheduler). */
const DEFAULT_STRATEGY = 'restart-on-first-failure';
const WAIT_ALL_STRATEGY = 'wait-all';

export class SubStepDependencyValidator {
	constructor(private issueCollector: IssueCollector) {}

	public validate(flow: FlowDefinition): void {
		const waitAllParents = new Set(
			flow.steps.filter(s => (s.subStepStrategy ?? DEFAULT_STRATEGY) === WAIT_ALL_STRATEGY).map(s => s.id)
		);

		for (const step of flow.steps) {
			if (step.parent === undefined || !waitAllParents.has(step.parent)) {
				continue;
			}
			const siblingIds = new Set(flow.steps.filter(s => s.parent === step.parent).map(s => s.id));
			for (const dependencyId of step.depends ?? []) {
				if (!siblingIds.has(dependencyId)) {
					continue;
				}
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.SUB_STEP_SIBLING_DEPENDENCY,
					message: `Sub-step '${step.id}' of '${step.parent}' depends on its sibling sub-step '${dependencyId}' and '${step.parent}' uses subStepStrategy: wait-all: if '${dependencyId}' fails, '${step.id}' is settled as not run, so its own checks give no feedback in that round`,
					location: { stepId: step.id, field: 'depends' },
					suggestion: `Set subStepStrategy: restart-on-first-failure on '${step.parent}', or remove '${dependencyId}' from the depends of '${step.id}' so both sub-steps run and report in the same round`,
				});
			}
		}
	}
}
