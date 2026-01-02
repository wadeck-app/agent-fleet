/**
 * Flow Executor (Refactored)
 *
 * Simplified facade that orchestrates flow execution using specialized components.
 */
import type { TemplateContext } from '../processing/TemplateRenderer';
import type { FlowRegistry } from '../registry/FlowRegistry';
import type { FlowDefinition, FlowExecutionResult, Workspace } from '../types';
import { FlowOrchestrator } from './FlowOrchestrator';
import { StepRunner } from './StepRunner';

/**
 * Options for flow execution
 */
export interface FlowExecutionOptions {
	/** Task ID executing this flow */
	taskId: string;

	/** Flow to execute */
	flow: FlowDefinition;

	/** Workspace to use */
	workspace: Workspace;

	/** Input variables */
	inputs: Record<string, any>;

	/** Task metadata (priority, createdAt, etc.) */
	taskMetadata?: Record<string, any>;

	/** Environment variables for Claude (for hooks) */
	claudeEnv?: Record<string, string>;

	/** Callback when Claude process starts (to store reference for killing) */
	onClaudeProcessStarted?: (process: any) => void;

	/** Handler for user interventions (approval, questions, choices) */
	interventionHandler?: import('./InterventionHandler').InterventionHandler;

	/** Nesting depth for SubFlowStep recursion tracking */
	nestingDepth?: number;
}

/**
 * Flow execution error
 */
export class FlowExecutionError extends Error {
	constructor(
		message: string,
		public flowId: string,
		public stepId?: string
	) {
		super(`Flow execution error in '${flowId}'${stepId ? ` at step '${stepId}'` : ''}: ${message}`);
		this.name = 'FlowExecutionError';
	}
}

/**
 * Flow Executor class (Refactored)
 */
export class FlowExecutor {
	private stepRunner: StepRunner;
	private orchestrator: FlowOrchestrator;
	private flowRegistry?: FlowRegistry;

	constructor(interactive: boolean = false, flowRegistry?: FlowRegistry) {
		// Create step runner with configuration
		this.stepRunner = new StepRunner({
			interactive,
		});

		// Store flow registry reference
		this.flowRegistry = flowRegistry;

		// Configure StepRunner with FlowRegistry and self-reference for recursion
		if (flowRegistry) {
			this.stepRunner.setFlowRegistry(flowRegistry);
		}
		this.stepRunner.setFlowExecutor(this);

		// Create orchestrator
		this.orchestrator = new FlowOrchestrator(this.stepRunner);
	}

	/**
	 * Set the flow registry (useful if not provided in constructor)
	 */
	public setFlowRegistry(flowRegistry: FlowRegistry): void {
		this.flowRegistry = flowRegistry;
		this.stepRunner.setFlowRegistry(flowRegistry);
	}

	/**
	 * Execute a complete flow
	 */
	public async execute(options: FlowExecutionOptions): Promise<FlowExecutionResult> {
		const {
			taskId,
			flow,
			workspace,
			inputs,
			taskMetadata = {},
			claudeEnv,
			onClaudeProcessStarted,
			interventionHandler,
			nestingDepth = 0,
		} = options;

		// Update step runner configuration with Claude env and callback
		this.stepRunner = new StepRunner({
			interactive: this.stepRunner['config'].interactive,
			claudeEnv,
			onClaudeProcessStarted,
			interventionHandler,
			flowRegistry: this.flowRegistry,
			flowExecutor: this,
		});

		// Recreate orchestrator with updated step runner
		this.orchestrator = new FlowOrchestrator(this.stepRunner);

		// Context for template rendering
		const stepOutputs = new Map<string, Record<string, any>>();
		const context: TemplateContext = {
			inputs,
			stepOutputs,
			taskMetadata,
			nestingDepth,
			taskId,
			claudeEnv,
			onClaudeProcessStarted,
		};

		// Orchestrate execution
		return this.orchestrator.orchestrate(taskId, flow, workspace, context);
	}
}
