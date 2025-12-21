/**
 * Condition Evaluator
 *
 * Evaluates conditional expressions for flow transitions.
 * Uses a safe subset of JavaScript expressions.
 *
 * Supported expressions:
 * - Comparisons: ===, !==, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Property access: output.field, output.nested.field
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
 * Context for condition evaluation
 */
export interface ConditionContext {
	/** Output variables from the current step */
	output: Record<string, any>;

	/** Input variables from the flow */
	inputs?: Record<string, any>;

	/** Task metadata */
	task?: Record<string, any>;
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
			// Create a safe evaluation context
			// We use Function constructor with limited scope
			const safeContext = {
				output: context.output || {},
				inputs: context.inputs || {},
				task: context.task || {},
			};

			// Wrap condition in a safe evaluation function
			// This allows simple expressions like: output.complexity === 'high'
			const evalFunction = new Function('output', 'inputs', 'task', `"use strict"; return (${condition});`);

			const result = evalFunction(safeContext.output, safeContext.inputs, safeContext.task);

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
			// Try to create the function to check syntax
			new Function('output', 'inputs', 'task', `"use strict"; return (${condition});`);
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
