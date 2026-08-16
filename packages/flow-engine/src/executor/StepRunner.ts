/**
 * Step Runner
 *
 * Executes individual flow steps (script, model, subflow, and user_intervention types) with retry logic.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ClaudeLauncher } from '../processing/ClaudeLauncher';
import { OutputExtractor } from '../processing/OutputExtractor';
import { StreamEventMapper } from '../processing/StreamEventMapper';
import { type TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { FlowRegistry } from '../registry/FlowRegistry';
import type {
	ExecutionConfig,
	FlowStep,
	LiveLogEntry,
	ModelFlowStep,
	ScriptFlowStep,
	StepOutput,
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

	/** Execution configuration for Claude CLI flags */
	executionConfig?: ExecutionConfig;
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
	 * Execute a step exactly once and return the trace.
	 * Retry logic is handled by FlowScheduler at the daemon level — StepRunner never retries.
	 * @param onStepTraceCreated - Called when the StepTrace is created, before execution begins.
	 */
	public async executeStep(
		step: FlowStep,
		workspace: Workspace,
		context: TemplateContext,
		onStepTraceCreated?: (stepTrace: StepTrace) => void,
		onLogEntry?: (entry: LiveLogEntry) => void
	): Promise<StepTrace> {
		const stepTrace: StepTrace = {
			stepId: step.id,
			stepName: step.name,
			stepType: step.type,
			startTime: Date.now(),
			retries: 0,
		};

		onStepTraceCreated?.(stepTrace);

		try {
			if (step.type === 'script') {
				return await this.executeScriptStep(step, workspace, context, stepTrace);
			} else if (step.type === 'model') {
				return await this.executeModelStep(step, workspace, context, stepTrace, onLogEntry);
			} else if (step.type === 'subflow') {
				return await this.executeSubFlowStep(step, workspace, context, stepTrace);
			} else if (step.type === 'user_intervention') {
				return await this.executeUserInterventionStep(step, workspace, context, stepTrace);
			} else {
				throw new StepExecutionError(
					`Unknown step type: ${(step as any).type}`,
					(step as any).id,
					(step as any).type
				);
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.error = err.message;
			return stepTrace;
		}
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

		// Render env values with variable interpolation (same as script)
		const renderedEnv = step.env
			? Object.fromEntries(
					Object.entries(step.env).map(([k, v]) => [k, this.templateRenderer.render(v, context, true)])
				)
			: undefined;

		// Execute script with real-time streaming
		const workingDir = step.workingDir || workspace.path;
		const result = await this.scriptExecutor.execute({
			script: renderedScript,
			workingDir,
			env: renderedEnv,
			streaming: true,
			stepId: step.id,
			// StepRunner is invoked by the orchestrator which manages its own env strategy
			isolateEnv: false,
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
		this.writeOutputFiles(outputs, step.output, context);

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
		stepTrace: StepTrace,
		onLogEntry?: (entry: LiveLogEntry) => void
	): Promise<StepTrace> {
		// Render prompt with variable interpolation
		const renderedPrompt = this.templateRenderer.render(step.prompt, context, true);

		stepTrace.prompt = renderedPrompt;
		stepTrace.model = step.model;

		// Read execution config (defaults: all enabled)
		const execConfig = this.config.executionConfig;
		const streamJson = execConfig?.streamJson !== false;
		const verbose = execConfig?.verbose !== false;
		const skipPermissions = execConfig?.skipPermissions !== false;

		// Set up streaming if enabled
		let finalResultText: string | undefined;
		const liveLogEntries: LiveLogEntry[] = [];
		let streamEventMapper: StreamEventMapper | undefined;
		const logMode = (step as ModelFlowStep).log ?? 'end';

		// log:none — no stream mapper, no liveLogEntries; but we still need result text
		if (streamJson && !this.config.interactive) {
			if (logMode !== 'none') {
				stepTrace.liveLogEntries = liveLogEntries;
				streamEventMapper = new StreamEventMapper(step.id);
			}
		}

		// For log:polling, buffer entries and flush periodically
		let pollingInterval: ReturnType<typeof setInterval> | undefined;
		let pollingBuffer: LiveLogEntry[] = [];
		if (logMode === 'polling' && onLogEntry) {
			pollingInterval = setInterval(() => {
				const batch = pollingBuffer.splice(0);
				for (const e of batch) onLogEntry(e);
			}, 500);
		}

		const launchOptions = {
			workingDir: workspace.path,
			prompt: renderedPrompt,
			stepId: step.id,
			model: step.model,
			env: this.config.claudeEnv,
			onProcessStarted: this.config.onClaudeProcessStarted,
			streamJson: streamJson && !this.config.interactive,
			verbose: verbose && !this.config.interactive,
			skipPermissions,
			// StepRunner is invoked by the orchestrator which manages its own env strategy
			isolateEnv: false,
			// Always provide onStreamEvent when stream-json is active to capture finalResultText
			onStreamEvent: streamJson && !this.config.interactive
				? (event: import('../processing/StreamJsonParser').StreamJsonEvent) => {
						// Capture the final result text for output extraction (always)
						if (event.type === 'result' && event.data.result) {
							finalResultText = event.data.result;
						}
						if (logMode === 'none') return; // suppress log entries
						const entry = streamEventMapper?.map(event);
						if (entry) {
							liveLogEntries.push(entry);
							// streaming: fire onLogEntry immediately
							if (logMode === 'streaming' && onLogEntry) {
								onLogEntry(entry);
							}
							// polling: buffer for interval flush
							if (logMode === 'polling') {
								pollingBuffer.push(entry);
							}
						}
					}
				: undefined,
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
				this.writeOutputFiles(stepTrace.outputs ?? {}, step.output, context);

				return stepTrace;
			} else {
				// Background mode
				const result = await this.claudeManager.launchBackground(launchOptions);

				// Flush polling buffer on completion
				if (pollingInterval) {
					clearInterval(pollingInterval);
					const remaining = pollingBuffer.splice(0);
					if (onLogEntry) for (const e of remaining) onLogEntry(e);
				}

				// When stream-json is active, use the clean result text instead of raw NDJSON
				const responseText = streamJson && finalResultText != null ? finalResultText : result.stdout;

				stepTrace.response = responseText;
				stepTrace.stdout = result.stdout;
				stepTrace.stderr = result.stderr;
				stepTrace.exitCode = result.exitCode;
				stepTrace.endTime = Date.now();
				stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

				// Cap live log entries to prevent memory issues
				if (stepTrace.liveLogEntries) {
					stepTrace.liveLogEntries = StreamEventMapper.capEntries(stepTrace.liveLogEntries);
				}

				if (result.exitCode !== 0) {
					stepTrace.error = `Claude exited with code ${result.exitCode}\n${result.stderr}`;
					return stepTrace;
				}

				// Extract outputs using clean response text
				stepTrace.outputs = this.outputExtractor.extract(responseText, step.output, step.id, {
					response: responseText,
					stdout: result.stdout,
					stderr: result.stderr,
				});
				this.writeOutputFiles(stepTrace.outputs ?? {}, step.output, context);

				return stepTrace;
			}
		} catch (error) {
			if (pollingInterval) clearInterval(pollingInterval);
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

				// Build additional context with intervention data
				// All intervention values are under 'intervention' namespace
				// Users reference them explicitly with 'from' field:
				//   output:
				//     approved: { type: boolean, from: 'intervention.approved' }
				//     comment: { type: string, from: 'intervention.comment' }
				const additionalContext = {
					intervention: {
						// Raw intervention response values
						value: response.value, // The user's response value (boolean for approval, string/number for question, string/array for choice)
						comment: response.comment, // Optional comment
						answeredBy: response.answeredBy, // Who answered
						answeredAt: response.answeredAt, // When answered

						// Common aliases for convenience
						userResponse: response.value, // Generic alias

						// Type-specific aliases (work for any type)
						approved: response.value === true, // For approval: true if approved
						rejected: response.value === false, // For approval: true if rejected
						answer: response.value, // For question: the answer value
						choice: response.value, // For choice: the selected choice(s)
					},
				};

				// Convert response value to string for extraction (OutputExtractor expects string)
				const rawOutput = response.value != null ? String(response.value) : '';

				// Extract outputs using declarative configuration with explicit 'from' paths
				const outputs = this.outputExtractor.extract(rawOutput, step.output, step.id, additionalContext);

				stepTrace.outputs = outputs;
			} else {
				// Non-blocking intervention that returned immediately
				console.log(`[StepRunner] Non-blocking intervention ${step.id} requested`);

				// For non-blocking, extract outputs with empty context
				const outputs = this.outputExtractor.extract('', step.output, step.id, {
					interventionRequested: true,
				});

				stepTrace.outputs = outputs;
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

	/**
	 * Write extracted output values to the metadata outputs directory for any config with writeOutput set.
	 * Files go to <workspaceDir>.meta/outputs/ — NEVER inside workspaceDir — preventing git pollution
	 * and ensuring Claude cannot overwrite engine-generated artifacts.
	 */
	private writeOutputFiles(
		outputs: Record<string, unknown>,
		outputConfig: StepOutput | undefined,
		context: TemplateContext
	): void {
		if (!outputConfig) return;
		const outputsDir = context.context?.outputsDir;
		if (!outputsDir) return;
		for (const [varName, config] of Object.entries(outputConfig)) {
			if (!config.writeOutput) continue;
			const relPath = config.writeOutput;
			// Reject path traversal
			const normalized = path.normalize(relPath);
			if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
				throw new Error(
					`writeOutput path '${relPath}' is invalid: must be a relative path`
				);
			}
			const filePath = path.join(outputsDir, normalized);
			const value = outputs[varName];
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, value != null ? String(value) : '', 'utf8');
		}
	}
}
