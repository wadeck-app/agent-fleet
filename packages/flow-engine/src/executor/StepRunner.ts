/**
 * Step Runner
 *
 * Executes individual flow steps (script, model, subflow, and user_intervention types) with retry logic.
 */
import { ClaudeLauncher } from '../processing/ClaudeLauncher';
import { OutputExtractor } from '../processing/OutputExtractor';
import { type TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { FlowRegistry } from '../registry/FlowRegistry';
import type {
	FlowStep,
	ModelFlowStep,
	ScriptFlowStep,
	StepTrace,
	SubFlowStep,
	UserInterventionStep,
	Workspace,
} from '../types';
import type { InterventionHandler } from './InterventionHandler';
import { ScriptExecutor } from './ScriptExecutor';

/**
 * Step execution error
 */
export class StepExecutionError extends Error {
	constructor(
		message: string,
		public stepId: string,
		public stepType: string
	) {
		super(`Step execution error in '${stepId}' (${stepType}): ${message}`);
		this.name = 'StepExecutionError';
	}
}

/**
 * Step Runner configuration
 */
export interface StepRunnerConfig {
	/** Interactive mode for Claude steps */
	interactive: boolean;

	/** Environment variables for Claude */
	claudeEnv?: Record<string, string>;

	/** Callback when Claude process starts */
	onClaudeProcessStarted?: (process: any) => void;

	/** Flow registry for looking up subflows (optional, set after construction) */
	flowRegistry?: FlowRegistry;

	/** Flow executor for recursive subflow execution (optional, set after construction) */
	flowExecutor?: any; // Using 'any' to avoid circular dependency

	/** Intervention handler for user intervention steps (optional, set after construction) */
	interventionHandler?: InterventionHandler;
}

/**
 * Step Runner class
 */
export class StepRunner {
	private templateRenderer: TemplateRenderer;
	private scriptExecutor: ScriptExecutor;
	private outputExtractor: OutputExtractor;
	private claudeManager: ClaudeLauncher;
	private config: StepRunnerConfig;

	constructor(config: StepRunnerConfig) {
		this.templateRenderer = new TemplateRenderer();
		this.scriptExecutor = new ScriptExecutor();
		this.outputExtractor = new OutputExtractor();
		this.claudeManager = new ClaudeLauncher();
		this.config = config;
	}

	/**
	 * Set the flow registry (used for subflow lookups)
	 */
	public setFlowRegistry(flowRegistry: FlowRegistry): void {
		this.config.flowRegistry = flowRegistry;
	}

	/**
	 * Set the flow executor (used for recursive subflow execution)
	 */
	public setFlowExecutor(flowExecutor: any): void {
		this.config.flowExecutor = flowExecutor;
	}

	/**
	 * Set the intervention handler (used for user intervention steps)
	 */
	public setInterventionHandler(interventionHandler: InterventionHandler): void {
		this.config.interventionHandler = interventionHandler;
	}

	/**
	 * Execute a step with retry logic
	 */
	public async executeStep(step: FlowStep, workspace: Workspace, context: TemplateContext): Promise<StepTrace> {
		const maxAttempts = step.retry?.maxAttempts || 1;
		const backoffStrategy = step.retry?.backoff || 'linear';

		let lastError: Error | undefined;
		let attempt = 0;

		while (attempt < maxAttempts) {
			attempt++;

			const stepTrace: StepTrace = {
				stepId: step.id,
				stepName: step.name,
				stepType: step.type,
				startTime: Date.now(),
				retries: attempt - 1,
			};

			try {
				let result: StepTrace;

				if (step.type === 'script') {
					result = await this.executeScriptStep(step, workspace, context, stepTrace);
				} else if (step.type === 'model') {
					result = await this.executeModelStep(step, workspace, context, stepTrace);
				} else if (step.type === 'subflow') {
					result = await this.executeSubFlowStep(step, workspace, context, stepTrace);
				} else if (step.type === 'user_intervention') {
					result = await this.executeUserInterventionStep(step, workspace, context, stepTrace);
				} else {
					throw new StepExecutionError(
						`Unknown step type: ${(step as any).type}`,
						(step as any).id,
						(step as any).type
					);
				}

				// If successful, return immediately
				if (!result.error) {
					return result;
				}

				// If error and we have retries left, continue
				if (attempt < maxAttempts) {
					lastError = new Error(result.error);
					await this.sleep(this.calculateBackoff(attempt, backoffStrategy));
					continue;
				}

				// Last attempt failed, return the error
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// If we have retries left, wait and try again
				if (attempt < maxAttempts) {
					await this.sleep(this.calculateBackoff(attempt, backoffStrategy));
					continue;
				}

				// Last attempt, return error trace
				stepTrace.endTime = Date.now();
				stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
				stepTrace.error = lastError.message;
				return stepTrace;
			}
		}

		// Should never reach here, but TypeScript needs it
		throw lastError || new Error('Unknown error in step execution');
	}

	/**
	 * Execute a script step
	 */
	private async executeScriptStep(
		step: ScriptFlowStep,
		workspace: Workspace,
		context: TemplateContext,
		stepTrace: StepTrace
	): Promise<StepTrace> {
		// Render script with variable interpolation
		const renderedScript = this.templateRenderer.render(step.script, context, true);

		stepTrace.script = renderedScript;

		// Execute script with real-time streaming
		const workingDir = step.workingDir || workspace.path;
		const result = await this.scriptExecutor.execute({
			script: renderedScript,
			workingDir,
			env: step.env,
			streaming: true,
			stepId: step.id,
		});

		// Populate trace
		stepTrace.exitCode = result.exitCode;
		stepTrace.stdout = result.stdout;
		stepTrace.stderr = result.stderr;
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = result.durationMs;

		// Extract outputs using configuration
		const additionalContext = {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			success: result.success,
		};

		const outputs = this.outputExtractor.extract(result.stdout, step.output, step.id, additionalContext);

		stepTrace.outputs = outputs;

		// Mark as error if script failed
		if (!result.success) {
			stepTrace.error = `Script exited with code ${result.exitCode}`;
		}

		return stepTrace;
	}

	/**
	 * Execute a model step (launches Claude)
	 */
	private async executeModelStep(
		step: ModelFlowStep,
		workspace: Workspace,
		context: TemplateContext,
		stepTrace: StepTrace
	): Promise<StepTrace> {
		// Render prompt with variable interpolation
		const renderedPrompt = this.templateRenderer.render(step.prompt, context, true);

		stepTrace.prompt = renderedPrompt;
		stepTrace.model = step.model;

		const launchOptions = {
			workingDir: workspace.path,
			prompt: renderedPrompt,
			stepId: step.id,
			model: step.model,
			env: this.config.claudeEnv,
			onProcessStarted: this.config.onClaudeProcessStarted,
		};

		try {
			if (this.config.interactive) {
				// Interactive mode
				const result = await this.claudeManager.launchInteractive(launchOptions);

				stepTrace.response = result.response;
				stepTrace.exitCode = result.exitCode ?? undefined;
				stepTrace.endTime = Date.now();
				stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

				if (result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null) {
					stepTrace.error = `Claude exited with code ${result.exitCode}`;
					return stepTrace;
				}

				// Extract outputs
				stepTrace.outputs = this.outputExtractor.extract(result.response, step.output, step.id, {
					response: result.response,
				});

				return stepTrace;
			} else {
				// Background mode
				const result = await this.claudeManager.launchBackground(launchOptions);

				stepTrace.response = result.stdout;
				stepTrace.stdout = result.stdout;
				stepTrace.stderr = result.stderr;
				stepTrace.exitCode = result.exitCode;
				stepTrace.endTime = Date.now();
				stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

				if (result.exitCode !== 0) {
					stepTrace.error = `Claude exited with code ${result.exitCode}\n${result.stderr}`;
					return stepTrace;
				}

				// Extract outputs
				stepTrace.outputs = this.outputExtractor.extract(result.stdout, step.output, step.id, {
					response: result.stdout,
					stdout: result.stdout,
					stderr: result.stderr,
				});

				return stepTrace;
			}
		} catch (error) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = error instanceof Error ? error.message : String(error);
			return stepTrace;
		}
	}

	/**
	 * Calculate backoff delay in milliseconds
	 */
	private calculateBackoff(attempt: number, strategy: 'linear' | 'exponential'): number {
		const baseDelay = 1000; // 1 second

		if (strategy === 'exponential') {
			return baseDelay * Math.pow(2, attempt - 1);
		} else {
			// linear
			return baseDelay * attempt;
		}
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Execute a subflow step (flow composition)
	 */
	private async executeSubFlowStep(
		step: SubFlowStep,
		workspace: Workspace,
		context: TemplateContext,
		stepTrace: StepTrace
	): Promise<StepTrace> {
		// Phase 1: Only support 'inherit' strategy
		const strategy = step.workspaceStrategy || 'inherit';
		if (strategy === 'separate') {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = 'workspaceStrategy "separate" is not yet implemented (Phase 2)';
			return stepTrace;
		}

		// Check if FlowRegistry and FlowExecutor are available
		if (!this.config.flowRegistry) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = 'FlowRegistry not configured in StepRunner';
			return stepTrace;
		}

		if (!this.config.flowExecutor) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = 'FlowExecutor not configured in StepRunner';
			return stepTrace;
		}

		// Get referenced flow
		const flow = this.config.flowRegistry.getFlow(step.flowId);
		if (!flow) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = `Flow '${step.flowId}' not found`;
			return stepTrace;
		}

		// Check nesting depth
		const nestingDepth = (context.nestingDepth || 0) + 1;
		const MAX_NESTING_DEPTH = 10;
		if (nestingDepth > MAX_NESTING_DEPTH) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.nestingDepth = nestingDepth;
			stepTrace.error = `Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded`;
			return stepTrace;
		}

		// Render inputs using template renderer
		const renderedInputs: Record<string, any> = {};
		for (const [key, template] of Object.entries(step.inputs)) {
			try {
				renderedInputs[key] = this.templateRenderer.render(template, context, true);
			} catch (error) {
				stepTrace.endTime = Date.now();
				stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
				stepTrace.error = `Failed to render input '${key}': ${error instanceof Error ? error.message : String(error)}`;
				return stepTrace;
			}
		}

		// Populate trace with subflow information
		stepTrace.subFlowId = step.flowId;
		stepTrace.workspaceStrategy = strategy;
		stepTrace.nestingDepth = nestingDepth;

		console.log(`[StepRunner] Executing SubFlowStep: ${step.id} → ${step.flowId}`);
		console.log(`[StepRunner] Nesting depth: ${nestingDepth}`);
		console.log(`[StepRunner] Inputs:`, renderedInputs);

		try {
			// Execute flow recursively in SAME workspace
			const result = await this.config.flowExecutor.execute({
				taskId: context.taskId || 'unknown',
				flow,
				workspace, // Same workspace (inherit strategy)
				inputs: renderedInputs,
				taskMetadata: context.taskMetadata || {},
				claudeEnv: context.claudeEnv,
				onClaudeProcessStarted: context.onClaudeProcessStarted,
				nestingDepth, // Pass nesting depth
			});

			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

			if (result.success) {
				console.log(`[StepRunner] SubFlowStep ${step.id} completed successfully`);

				// Extract outputs from the subflow result
				// The outputs from the subflow are in result.outputs (keyed by step ID)
				// If the step has an output configuration, we need to render the templates
				if (step.output) {
					// Build a Map with the subflow's outputs for template rendering
					// result.outputs is structured as: { stepId: { outputKey: value } }
					// TemplateContext.stepOutputs is a Map<stepId, outputs>
					const subflowOutputsMap = new Map<string, Record<string, any>>();
					for (const [stepId, outputs] of Object.entries(result.outputs)) {
						subflowOutputsMap.set(stepId, outputs as Record<string, any>);
					}

					// Create a context for rendering output templates
					const outputContext: TemplateContext = {
						...context,
						stepOutputs: subflowOutputsMap,
					};

					// Render each output template
					const extractedOutputs: Record<string, any> = {};
					for (const [outputKey, template] of Object.entries(step.output)) {
						if (typeof template === 'string') {
							try {
								extractedOutputs[outputKey] = this.templateRenderer.render(
									template,
									outputContext,
									true
								);
							} catch (error) {
								stepTrace.error = `Failed to render output '${outputKey}': ${error instanceof Error ? error.message : String(error)}`;
								return stepTrace;
							}
						} else {
							// Non-string output config (OutputVariableConfig), not supported for SubFlowSteps yet
							console.warn(
								`[StepRunner] Complex output configuration for SubFlowStep '${step.id}' output '${outputKey}' is not supported. Use template strings.`
							);
						}
					}

					stepTrace.outputs = extractedOutputs;
				} else {
					// No output configuration, pass through all subflow outputs
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
			stepTrace.error = error instanceof Error ? error.message : String(error);
			console.error(`[StepRunner] SubFlowStep ${step.id} error:`, stepTrace.error);
			return stepTrace;
		}
	}

	/**
	 * Execute a user intervention step (request user approval/input)
	 */
	private async executeUserInterventionStep(
		step: UserInterventionStep,
		workspace: Workspace,
		context: TemplateContext,
		stepTrace: StepTrace
	): Promise<StepTrace> {
		// Check if intervention handler is configured
		if (!this.config.interventionHandler) {
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = 'InterventionHandler not configured in StepRunner';
			return stepTrace;
		}

		// Build intervention request based on step type
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

		// Render title and description with variable interpolation
		// Use type narrowing to access type-specific properties
		const renderedConfig: any = { ...config };

		if (step.interventionType === 'approval' && step.approval) {
			if (typeof step.approval.title === 'string') {
				renderedConfig.title = this.templateRenderer.render(step.approval.title, context, true);
			}
			if (typeof step.approval.description === 'string') {
				renderedConfig.description = this.templateRenderer.render(step.approval.description, context, true);
			}
		} else if (step.interventionType === 'question' && step.question) {
			if (typeof step.question.question === 'string') {
				renderedConfig.question = this.templateRenderer.render(step.question.question, context, true);
			}
		} else if (step.interventionType === 'choice' && step.choice) {
			if (typeof step.choice.question === 'string') {
				renderedConfig.question = this.templateRenderer.render(step.choice.question, context, true);
			}
		}

		const interventionRequest: import('./InterventionHandler').InterventionRequest = {
			taskId: context.taskId || 'unknown',
			workerId: context.workerId,
			flowId: context.flowId,
			stepId: step.id,
			type: step.interventionType,
			blocking: step.blocking !== false, // Default to true
			config: renderedConfig,
			timeout: step.timeout,
		};

		console.log(`[StepRunner] Executing UserInterventionStep: ${step.id}`);
		console.log(`[StepRunner] Intervention type: ${step.interventionType}`);
		console.log(`[StepRunner] Blocking: ${interventionRequest.blocking}`);

		stepTrace.interventionType = step.interventionType;
		stepTrace.interventionBlocking = interventionRequest.blocking;

		try {
			// Request intervention
			const response = await this.config.interventionHandler.requestIntervention(interventionRequest);

			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

			if (response) {
				console.log(`[StepRunner] User responded to intervention ${step.id}`);
				stepTrace.interventionResponse = response;

				// Extract outputs based on intervention type
				if (step.interventionType === 'approval') {
					stepTrace.outputs = {
						approved: response.value === true,
						rejected: response.value === false,
						userResponse: response.value,
						comment: response.comment,
					};
				} else if (step.interventionType === 'question') {
					stepTrace.outputs = {
						answer: response.value,
						comment: response.comment,
					};
				} else if (step.interventionType === 'choice') {
					stepTrace.outputs = {
						choice: response.value,
						comment: response.comment,
					};
				}
			} else {
				// Non-blocking intervention that returned immediately
				console.log(`[StepRunner] Non-blocking intervention ${step.id} requested`);
				stepTrace.outputs = {
					interventionRequested: true,
				};
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
}
