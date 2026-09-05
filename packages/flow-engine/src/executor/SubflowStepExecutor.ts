import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { FlowRegistry } from '../registry/FlowRegistry';
import type { StepTrace, SubFlowStep, Workspace } from '../types';

export async function executeSubFlowStep(
	step: SubFlowStep,
	workspace: Workspace,
	context: TemplateContext,
	stepTrace: StepTrace,
	config: {
		flowRegistry?: FlowRegistry;
		flowExecutor?: any;
	},
	templateRenderer: TemplateRenderer
): Promise<StepTrace> {
	const strategy = step.workspaceStrategy || 'inherit';
	if (strategy === 'separate') {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = 'workspaceStrategy "separate" is not yet implemented (Phase 2)';
		return stepTrace;
	}

	if (!config.flowRegistry) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = 'FlowRegistry not configured in StepRunner';
		return stepTrace;
	}

	if (!config.flowExecutor) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = 'FlowExecutor not configured in StepRunner';
		return stepTrace;
	}

	const flow = config.flowRegistry.getFlow(step.flowId);
	if (!flow) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = `Flow '${step.flowId}' not found`;
		return stepTrace;
	}

	const nestingDepth = (context.nestingDepth || 0) + 1;
	const MAX_NESTING_DEPTH = 10;
	if (nestingDepth > MAX_NESTING_DEPTH) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.nestingDepth = nestingDepth;
		stepTrace.error = `Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded`;
		return stepTrace;
	}

	const renderedInputs: Record<string, any> = {};
	for (const [key, template] of Object.entries(step.inputs)) {
		try {
			renderedInputs[key] = templateRenderer.render(template, context, true);
		} catch (error) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = `Failed to render input '${key}': ${error instanceof Error ? String(error) : String(error)}`;
			return stepTrace;
		}
	}

	stepTrace.subFlowId = step.flowId;
	stepTrace.workspaceStrategy = strategy;
	stepTrace.nestingDepth = nestingDepth;

	console.log(`[StepRunner] Executing SubFlowStep: ${step.id} → ${step.flowId}`);
	console.log(`[StepRunner] Nesting depth: ${nestingDepth}`);
	console.log(`[StepRunner] Inputs:`, renderedInputs);

	try {
		const result = await config.flowExecutor.execute({
			taskId: context.taskId || 'unknown',
			flow,
			workspace,
			inputs: renderedInputs,
			taskMetadata: context.taskMetadata || {},
			claudeEnv: context.claudeEnv,
			onClaudeProcessStarted: context.onClaudeProcessStarted,
			nestingDepth,
		});

		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

		if (result.success) {
			console.log(`[StepRunner] SubFlowStep ${step.id} completed successfully`);

			if (step.output) {
				const subflowOutputsMap = new Map<string, Record<string, any>>();
				for (const [stepId, outputs] of Object.entries(result.outputs)) {
					subflowOutputsMap.set(stepId, outputs as Record<string, any>);
				}
				const outputContext: TemplateContext = { ...context, stepOutputs: subflowOutputsMap };
				const extractedOutputs: Record<string, any> = {};
				for (const [outputKey, template] of Object.entries(step.output)) {
					if (typeof template === 'string') {
						try {
							extractedOutputs[outputKey] = templateRenderer.render(template, outputContext, true);
						} catch (error) {
							stepTrace.error = `Failed to render output '${outputKey}': ${error instanceof Error ? String(error) : String(error)}`;
							return stepTrace;
						}
					} else {
						console.warn(
							`[StepRunner] Complex output config for SubFlowStep '${step.id}' output '${outputKey}' is not supported. Use template strings.`
						);
					}
				}
				stepTrace.outputs = extractedOutputs;
			} else {
				stepTrace.outputs = result.outputs;
			}
		} else {
			console.log(`[StepRunner] SubFlowStep ${step.id} failed`);
			stepTrace.error = result.error || 'SubFlow execution failed';
		}

		return stepTrace;
	} catch (error) {
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = error instanceof Error ? String(error) : String(error);
		console.error(`[StepRunner] SubFlowStep ${step.id} error:`, stepTrace.error);
		return stepTrace;
	}
}
