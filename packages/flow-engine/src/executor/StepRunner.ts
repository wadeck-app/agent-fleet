/**
 * Step Runner — thin orchestrator that delegates to type-specific executors.
 *
 * Each step type has its own module:
 *   - ScriptStepExecutor.ts  — script steps
 *   - ModelStepExecutor.ts   — model (Claude) steps
 *   - SubflowStepExecutor.ts — subflow composition steps
 *   - UserInterventionStepExecutor.ts — human-in-the-loop steps
 */
import type { ApprovalProvider } from 'extension-points';

import { ClaudeModelProvider } from '../processing/ClaudeModelProvider';
import type { McpServer, ModelProvider } from '../processing/ModelProvider';
import { OpenCodeModelProvider } from '../processing/OpenCodeModelProvider';
import { OutputExtractor } from '../processing/OutputExtractor';
import { type TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { FlowRegistry } from '../registry/FlowRegistry';
import type {
	ExecutionConfig,
	FlowStep,
	LiveLogEntry,
	ModelFlowStep,
	ScriptFlowStep,
	StepTrace,
	SubFlowStep,
	UserInterventionStep,
	Workspace,
} from '../types';
import type { InterventionHandler } from './InterventionHandler';
import { executeModelStep } from './ModelStepExecutor';
import { ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';
import { executeSubFlowStep } from './SubflowStepExecutor';
import { executeUserInterventionStep } from './UserInterventionStepExecutor';

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

export interface StepRunnerConfig {
	/** Interactive mode for model steps */
	interactive: boolean;
	/** Environment variables forwarded to the model CLI */
	claudeEnv?: Record<string, string>;
	/** MCP servers to inject into model steps */
	mcpServers?: McpServer[];
	/** Callback when model CLI process starts */
	onClaudeProcessStarted?: (process: import('node:child_process').ChildProcess) => void;
	/** Flow registry for looking up subflows */
	flowRegistry?: FlowRegistry;
	/** Flow executor for recursive subflow execution */
	flowExecutor?: any;
	/** Intervention handler for user intervention steps (legacy) */
	interventionHandler?: InterventionHandler;
	/** Approval provider for user intervention steps (preferred) */
	approvalProvider?: ApprovalProvider;
	/** Execution configuration for model CLI flags */
	executionConfig?: ExecutionConfig;
	/** Optional provider map override — used in tests to inject mock providers without I/O */
	providers?: Map<string, ModelProvider>;
}

export class StepRunner {
	private readonly templateRenderer = new TemplateRenderer();
	private readonly scriptExecutor = new ScriptExecutor();
	private readonly outputExtractor = new OutputExtractor();
	private readonly providers: Map<string, ModelProvider>;
	private config: StepRunnerConfig;

	constructor(config: StepRunnerConfig) {
		this.config = config;
		// REQUIREMENT: When adding a new provider, add 1-2 flow-level integration tests
		// in StepRunner.opencode.integration.test.ts using the provider's mock CLI.
		this.providers =
			config.providers ??
			new Map<string, ModelProvider>([
				['claude', new ClaudeModelProvider()],
				['opencode', new OpenCodeModelProvider()],
			]);
	}

	/** Kill all currently-executing model providers (called on abort). */
	public kill(): void {
		for (const provider of this.providers.values()) {
			provider.kill();
		}
	}

	/** @internal kept for tests that access private API via (runner as any).calculateBackoff */
	private calculateBackoff(attempt: number, strategy: 'linear' | 'exponential'): number {
		const baseDelay = 1000;
		return strategy === 'exponential' ? baseDelay * Math.pow(2, attempt - 1) : baseDelay * attempt;
	}

	public setFlowRegistry(flowRegistry: FlowRegistry): void {
		this.config.flowRegistry = flowRegistry;
	}
	public setFlowExecutor(flowExecutor: any): void {
		this.config.flowExecutor = flowExecutor;
	}
	public setInterventionHandler(interventionHandler: InterventionHandler): void {
		this.config.interventionHandler = interventionHandler;
	}
	public setApprovalProvider(approvalProvider: ApprovalProvider): void {
		this.config.approvalProvider = approvalProvider;
	}

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
			const services = {
				templateRenderer: this.templateRenderer,
				scriptExecutor: this.scriptExecutor,
				outputExtractor: this.outputExtractor,
			};

			if (step.type === 'script') {
				return await executeScriptStep(step as ScriptFlowStep, workspace.path, context, stepTrace, services);
			} else if (step.type === 'model') {
				const modelStep = step as ModelFlowStep;
				const providerName = modelStep.provider ?? 'claude';
				const provider = this.providers.get(providerName);
				if (!provider) {
					throw new StepExecutionError(
						`Unknown model provider '${providerName}'. Supported: ${[...this.providers.keys()].join(', ')}`,
						modelStep.id,
						'model'
					);
				}
				return await executeModelStep(
					modelStep,
					workspace.path,
					context,
					stepTrace,
					{
						interactive: this.config.interactive,
						claudeEnv: this.config.claudeEnv,
						mcpServers: this.config.mcpServers,
						provider,
						onClaudeProcessStarted: this.config.onClaudeProcessStarted,
						executionConfig: this.config.executionConfig,
					},
					services,
					onLogEntry
				);
			} else if (step.type === 'subflow') {
				return await executeSubFlowStep(
					step as SubFlowStep,
					workspace,
					context,
					stepTrace,
					{ flowRegistry: this.config.flowRegistry, flowExecutor: this.config.flowExecutor },
					this.templateRenderer
				);
			} else if (step.type === 'user_intervention') {
				return await executeUserInterventionStep(
					step as UserInterventionStep,
					context,
					stepTrace,
					{
						approvalProvider: this.config.approvalProvider,
						interventionHandler: this.config.interventionHandler,
					},
					services
				);
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
}
