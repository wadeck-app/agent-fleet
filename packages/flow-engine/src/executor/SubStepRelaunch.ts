import type { ModelProvider } from '../processing/ModelProvider';
import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { ModelFlowStep } from '../types';

/** What a parent model step is launched with when it is re-run because a sub-step failed. */
export interface SubStepRelaunch {
	/** Session of the parent's previous run, resumed so it keeps its context. */
	resumeSessionId: string;
	/** The only user message sent: the failed sub-steps' feedback inside a short wrapper. */
	message: string;
}

/** Wrapper used when the step declares no `subStepFeedbackPrompt`. */
export function defaultSubStepFeedbackMessage(feedback: string): string {
	return `The sub-step(s) that checked your previous answer failed. Their feedback follows. Fix what they report, then answer again.\n\n${feedback}`;
}

/**
 * Decides how a parent model step is relaunched after a sub-step failure.
 *
 * The feedback goes into the parent's EXISTING session, so the original prompt is deliberately
 * not rendered or sent again. When that session cannot be resumed this returns an error instead
 * of falling back to a fresh conversation: the fallback would silently drop everything the model
 * had already done and look like a normal retry.
 */
export function buildSubStepRelaunch(args: {
	step: ModelFlowStep;
	feedback: string;
	context: TemplateContext;
	provider: ModelProvider;
	providerLabel: string;
	templateRenderer: Pick<TemplateRenderer, 'render'>;
}): SubStepRelaunch | { error: string } {
	const { step, feedback, context, provider, providerLabel, templateRenderer } = args;
	const head = `Model step '${step.id}' was re-queued because a sub-step failed, and the feedback has to be delivered into the step's existing session`;

	if (provider.supportsSessionResume !== true) {
		return {
			error: `${head}, but provider '${providerLabel}' cannot resume a session. Run this step on a provider that can (claude, opencode, codex), or set maxSubStepIterations: 0 on it to fail on the first sub-step failure instead.`,
		};
	}

	const sessionId = context.stepMeta?.get(step.id)?.['session_id'];
	if (typeof sessionId !== 'string' || sessionId === '') {
		return {
			error: `${head}, but no session_id was recorded for its previous run, so there is no conversation to resume (provider '${providerLabel}' reported none). Check the previous run's log of step '${step.id}': the provider must emit a session id for a sub-step relaunch to continue it.`,
		};
	}

	const message =
		step.subStepFeedbackPrompt === undefined
			? defaultSubStepFeedbackMessage(feedback)
			: templateRenderer.render(step.subStepFeedbackPrompt, { ...context, subStepFeedback: feedback }, true);

	return { resumeSessionId: sessionId, message };
}
