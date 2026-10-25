import { normalizeError } from 'shared-common/utils/getErrorMessage';

import { ConditionEvaluationError } from '../processing/ConditionEvaluator';
import type { SchedulerContext, SchedulerStep } from './SchedulerTypes';

/** Evaluates the `when:` condition of a step against the outputs of the steps it depends on. */
export class WhenConditionEvaluator {
	constructor(
		private readonly originalDeps: Map<string, Set<string>>,
		private readonly stepOutputs: Map<string, Record<string, unknown>>,
		private readonly context: Pick<SchedulerContext, 'inputs'>
	) {}

	/**
	 * Evaluate a step's when: condition.
	 *
	 * Context exposed to the expression:
	 *   outputs  -- step outputs keyed by dep step id: { 'dep-id': { field: value } }
	 *   inputs   -- flow-level inputs
	 *   steps    -- same data in GitHub Actions shape: { 'dep-id': { outputs: { field: value } } }
	 *              (available in both bare and ${{ }} forms)
	 *
	 * Dot-notation for hyphenated IDs is supported transparently:
	 *   `outputs.get-status.field` -> converted to `outputs['get-status'].field`
	 *   `steps.get-status.outputs.field` -> converted to `steps['get-status'].outputs.field`
	 *
	 * Both bare expressions and ${{ }} wrapper are supported.
	 */
	evaluate(step: SchedulerStep): boolean {
		const stepId = step.id;
		let condition = step.when!.trim();

		// Strip ${{ }} wrapper if present
		if (condition.startsWith('${{') && condition.endsWith('}}')) {
			condition = condition.slice(3, -2).trim();
		}

		// Convert dot-notation segments with hyphens to bracket notation
		// e.g. steps.get-status.outputs.x -> steps['get-status'].outputs.x
		condition = WhenConditionEvaluator.normalizeDotNotation(condition);

		const depIds = Array.from(this.originalDeps.get(stepId) ?? []);

		// outputs: keyed by dep step id
		const outputs: Record<string, Record<string, unknown>> = {};
		for (const depId of depIds) {
			outputs[depId] = this.stepOutputs.get(depId) ?? {};
		}

		// steps: GitHub Actions shape (for ${{ steps.X.outputs.Y }} style expressions)
		const steps: Record<string, { outputs: Record<string, unknown> }> = {};
		for (const depId of depIds) {
			steps[depId] = { outputs: this.stepOutputs.get(depId) ?? {} };
		}

		try {
			const evalFn = new Function('outputs', 'inputs', 'steps', `"use strict"; return (${condition});`);
			const result = evalFn(outputs, this.context.inputs, steps);
			if (typeof result !== 'boolean') {
				throw new ConditionEvaluationError(
					`Condition must evaluate to boolean, got: ${typeof result}`,
					condition,
					stepId
				);
			}
			return result;
		} catch (err) {
			if (err instanceof ConditionEvaluationError) {
				throw err;
			}
			throw new ConditionEvaluationError(
				`Failed to evaluate condition: ${normalizeError(err).message}`,
				condition,
				stepId
			);
		}
	}

	/**
	 * Convert dot-notation path segments that are not valid JS identifiers to bracket notation.
	 * Handles `outputs.get-status.field` -> `outputs['get-status'].field`
	 * and `steps.get-status.outputs.field` -> `steps['get-status'].outputs.field`
	 */
	private static normalizeDotNotation(condition: string): string {
		// Match any dot-access segment that contains a hyphen or starts with a digit
		// Pattern: .<segment> where segment is NOT a valid JS identifier
		return condition.replace(/\.([a-zA-Z0-9_][a-zA-Z0-9_-]*-[a-zA-Z0-9_-]*)/g, "['$1']");
	}
}
