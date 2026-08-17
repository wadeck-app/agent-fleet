import type { ApprovalProvider } from 'extension-points';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { StepTrace, UserInterventionStep } from '../types';
import type { InterventionHandler } from './InterventionHandler';

export async function executeUserInterventionStep(
	step: UserInterventionStep,
	context: TemplateContext,
	stepTrace: StepTrace,
	config: {
		approvalProvider?: ApprovalProvider;
		interventionHandler?: InterventionHandler;
	},
	services: {
		templateRenderer: TemplateRenderer;
		outputExtractor: OutputExtractor;
	}
): Promise<StepTrace> {
	if (config.approvalProvider) {
		return executeViaApprovalProvider(step, context, stepTrace, config.approvalProvider, services);
	}

	if (!config.interventionHandler) {
		throw new Error(
			'No ApprovalProvider or InterventionHandler configured in StepRunner — cannot execute user_intervention step'
		);
	}
	console.warn('[StepRunner] Deprecation: InterventionHandler is active; migrate to ApprovalProvider.');

	return executeViaInterventionHandler(step, context, stepTrace, config.interventionHandler, services);
}

async function executeViaApprovalProvider(
	step: UserInterventionStep,
	context: TemplateContext,
	stepTrace: StepTrace,
	provider: ApprovalProvider,
	services: { templateRenderer: TemplateRenderer; outputExtractor: OutputExtractor }
): Promise<StepTrace> {
	const { templateRenderer, outputExtractor } = services;
	const taskId = context.taskId || 'unknown';

	stepTrace.interventionType = step.interventionType;
	stepTrace.interventionBlocking = step.blocking !== false;

	try {
		let responseValue: unknown;

		if (step.interventionType === 'approval' && step.approval) {
			const prompt = templateRenderer.render(step.approval.title, context, true);
			const ctx = step.approval.description
				? templateRenderer.render(step.approval.description, context, true)
				: undefined;
			responseValue = await provider.requestApproval({ taskId, stepId: step.id, prompt, context: ctx });
		} else if (step.interventionType === 'question' && step.question) {
			const prompt = templateRenderer.render(step.question.question, context, true);
			responseValue = await provider.requestInput({ taskId, stepId: step.id, prompt });
		} else if (step.interventionType === 'choice' && step.choice) {
			const prompt = templateRenderer.render(step.choice.question, context, true);
			const choices = step.choice.options.map(o => ({ id: o.id, label: o.label, description: o.description }));
			responseValue = await provider.requestChoice({ taskId, stepId: step.id, prompt, choices });
		} else {
			throw new Error(`Missing configuration for intervention type '${step.interventionType}'`);
		}

		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

		const rawOutput = responseValue != null ? String(responseValue) : '';
		const additionalContext = {
			intervention: {
				value: responseValue,
				approved: responseValue === true,
				rejected: responseValue === false,
				answer: responseValue,
				choice: responseValue,
			},
		};
		stepTrace.outputs = outputExtractor.extract(rawOutput, step.output, step.id, additionalContext);
		return stepTrace;
	} catch (error) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = error instanceof Error ? error.message : String(error);
		return stepTrace;
	}
}

async function executeViaInterventionHandler(
	step: UserInterventionStep,
	context: TemplateContext,
	stepTrace: StepTrace,
	interventionHandler: InterventionHandler,
	services: { templateRenderer: TemplateRenderer; outputExtractor: OutputExtractor }
): Promise<StepTrace> {
	const { templateRenderer, outputExtractor } = services;

	const config =
		step.interventionType === 'approval'
			? step.approval
			: step.interventionType === 'question'
				? step.question
				: step.choice;

	if (!config) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = `Missing configuration for intervention type '${step.interventionType}'`;
		return stepTrace;
	}

	const renderedConfig: any = { ...config };

	if (step.interventionType === 'approval' && step.approval) {
		if (typeof step.approval.title === 'string')
			renderedConfig.title = templateRenderer.render(step.approval.title, context, true);
		if (typeof step.approval.description === 'string')
			renderedConfig.description = templateRenderer.render(step.approval.description, context, true);
	} else if (step.interventionType === 'question' && step.question) {
		if (typeof step.question.question === 'string')
			renderedConfig.question = templateRenderer.render(step.question.question, context, true);
	} else if (step.interventionType === 'choice' && step.choice) {
		if (typeof step.choice.question === 'string')
			renderedConfig.question = templateRenderer.render(step.choice.question, context, true);
	}

	const interventionRequest: import('./InterventionHandler').InterventionRequest = {
		taskId: context.taskId || 'unknown',
		workerId: context.workerId,
		flowId: context.flowId,
		stepId: step.id,
		type: step.interventionType,
		blocking: step.blocking !== false,
		config: renderedConfig,
		timeout: step.timeout,
	};

	stepTrace.interventionType = step.interventionType;
	stepTrace.interventionBlocking = interventionRequest.blocking;

	try {
		const response = await interventionHandler.requestIntervention(interventionRequest);

		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

		if (response) {
			stepTrace.interventionResponse = response;
			const additionalContext = {
				intervention: {
					value: response.value,
					comment: response.comment,
					answeredBy: response.answeredBy,
					answeredAt: response.answeredAt,
					userResponse: response.value,
					approved: response.value === true,
					rejected: response.value === false,
					answer: response.value,
					choice: response.value,
				},
			};
			const rawOutput = response.value != null ? String(response.value) : '';
			stepTrace.outputs = outputExtractor.extract(rawOutput, step.output, step.id, additionalContext);
		} else {
			console.log(`[StepRunner] Non-blocking intervention ${step.id} requested`);
			stepTrace.outputs = outputExtractor.extract('', step.output, step.id, { interventionRequested: true });
		}

		return stepTrace;
	} catch (error) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = error instanceof Error ? error.message : String(error);
		console.error(`[StepRunner] UserInterventionStep ${step.id} error:`, stepTrace.error);
		return stepTrace;
	}
}
