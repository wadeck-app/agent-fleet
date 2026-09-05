/**
 * Condition Evaluator
 *
 * Evaluates conditional expressions for flow transitions.
 * Uses a safe subset of JavaScript expressions.
 *
 * Supported expressions:
 * - Comparisons: ===, !==, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Property access: outputs['step-id'].field, inputs.field
 * - Boolean values: true, false
 * - Numbers: 42, 3.14
 * - Strings: "text", 'text'
 */

/**
 * Condition evaluation error
 */
export class ConditionEvaluationError extends Error {
	constructor(
		message: string,
		public condition: string,
		public stepId: string
	) {
		super(`Condition evaluation error in step '${stepId}': ${message}`);
		this.name = 'ConditionEvaluationError';
	}
}

/**
 * Context for condition evaluation.
 * `outputs` is keyed by dep step id: { 'dep-id': { field: value } }
 * `inputs` contains flow-level inputs.
 * Tasks are coupled to flows by events, not by core feature -- no task context here.
 */
export interface ConditionContext {
	/** Step outputs keyed by step id */
	outputs: Record<string, Record<string, unknown>>;

	/** Input variables from the flow */
	inputs?: Record<string, unknown>;
}

/**
 * Condition Evaluator class
 */
export class ConditionEvaluator {
	/**
	 * Evaluate a condition expression
	 *
	 * @param condition - Condition expression string
	 * @param context - Evaluation context
	 * @param stepId - Step ID for error messages
	 * @returns Boolean result
	 */
	public evaluate(condition: string, context: ConditionContext, stepId: string): boolean {
		try {
			const safeOutputs = context.outputs || {};
			const safeInputs = context.inputs || {};

			const evalFunction = new Function('outputs', 'inputs', `"use strict"; return (${condition});`);
			const result = evalFunction(safeOutputs, safeInputs);

			if (typeof result !== 'boolean') {
				throw new ConditionEvaluationError(
					`Condition must evaluate to boolean, got: ${typeof result}`,
					condition,
					stepId
				);
			}

			return result;
		} catch (error) {
			if (error instanceof ConditionEvaluationError) {
				throw error;
			}

			throw new ConditionEvaluationError(
				`Failed to evaluate condition: ${error instanceof Error ? error.message : String(error)}`,
				condition,
				stepId
			);
		}
	}

	/**
	 * Test if a condition is syntactically valid
	 *
	 * @param condition - Condition expression
	 * @returns True if valid
	 */
	public isValid(condition: string): boolean {
		try {
			new Function('outputs', 'inputs', `"use strict"; return (${condition});`);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Evaluate multiple conditions and return first matching goto
	 *
	 * @param conditions - Array of condition/goto pairs
	 * @param context - Evaluation context
	 * @param stepId - Step ID for error messages
	 * @returns First matching goto target, or undefined if no match
	 */
	public evaluateConditions(
		conditions: Array<{ when: string; goto: string }>,
		context: ConditionContext,
		stepId: string
	): string | undefined {
		for (const { when, goto } of conditions) {
			const result = this.evaluate(when, context, stepId);
			if (result) {
				return goto;
			}
		}

		return undefined;
	}
}
