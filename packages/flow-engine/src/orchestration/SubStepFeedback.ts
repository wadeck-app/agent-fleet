import type { SubStepRecord } from './SchedulerTypes';

/**
 * Aggregates every failed sub-step's own feedback into one string for the parent's retry
 * prompt, exposed as `${{ subStepFeedback }}` -- a flow author adding a new sub-step to a
 * retry chain does not also have to remember to wire its feedback into the prompt by hand.
 * Prefers stderr, falls back to rawOutput/stdout, then the raw outputs object -- whatever a
 * sub-step actually produced that explains the failure. A sub-step the engine itself failed
 * (stalled or lost worker) produced nothing: its recorded `error` is the only explanation, so it is
 * used instead of an empty `{}`.
 */
export function buildSubStepFeedback(subSteps: Map<string, SubStepRecord>): string {
	const parts: string[] = [];
	for (const [stepId, { outputs, error }] of subSteps) {
		const text =
			(outputs['stderr'] as string | undefined) ||
			(outputs['rawOutput'] as string | undefined) ||
			(outputs['stdout'] as string | undefined) ||
			(Object.keys(outputs).length === 0 ? error : undefined) ||
			JSON.stringify(outputs);
		parts.push(`[${stepId}]\n${text}`);
	}
	return parts.join('\n\n');
}
