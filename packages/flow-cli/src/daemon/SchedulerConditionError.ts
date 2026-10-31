/** A scheduler `when` evaluation error, recognised by shape: flow-engine does not export the class. */
function asConditionError(error: unknown): { stepId: string; condition: string; cause: string } | undefined {
	const candidate = error as { name?: unknown; stepId?: unknown; condition?: unknown; message?: unknown } | null;
	if (
		candidate?.name === 'ConditionEvaluationError' &&
		typeof candidate.stepId === 'string' &&
		typeof candidate.condition === 'string' &&
		typeof candidate.message === 'string'
	) {
		return { stepId: candidate.stepId, condition: candidate.condition, cause: candidate.message };
	}
	return undefined;
}

/**
 * The step and the actionable reason when the scheduler failed to evaluate a `when` (the cause, the expression and the
 * fix), or undefined when the error is anything else. One wording for the run start and for a step settling.
 */
export function describeConditionError(error: unknown): { stepId: string; reason: string } | undefined {
	const condition = asConditionError(error);
	if (condition === undefined) {
		return undefined;
	}
	const { stepId } = condition;
	const fix = condition.cause.includes('must evaluate to boolean')
		? `Fix: make the \`when\` of '${stepId}' a boolean expression, for example by comparing the value with ==.`
		: `The \`when\` of step '${stepId}' can only read the outputs of steps it depends on, directly or through its parent or a chain of \`depends\`. Fix: add the step it reads to \`depends\` of '${stepId}'.`;
	return { stepId, reason: `${condition.cause}. The expression is: ${condition.condition}. ${fix}` };
}
