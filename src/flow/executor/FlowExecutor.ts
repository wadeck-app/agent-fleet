/**
 * Flow Executor (Refactored)
 *
 * Simplified facade that orchestrates flow execution using specialized components.
 */

import type {
  FlowDefinition,
  FlowExecutionResult,
  Workspace,
} from '../types.js';
import type { TemplateContext } from '../processing/TemplateRenderer.js';
import { StepRunner } from './StepRunner.js';
import { FlowOrchestrator } from './FlowOrchestrator.js';

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
    super(
      `Flow execution error in '${flowId}'${
        stepId ? ` at step '${stepId}'` : ''
      }: ${message}`
    );
    this.name = 'FlowExecutionError';
  }
}

/**
 * Flow Executor class (Refactored)
 */
export class FlowExecutor {
  private stepRunner: StepRunner;
  private orchestrator: FlowOrchestrator;

  constructor(interactive: boolean = false) {
    // Create step runner with configuration
    this.stepRunner = new StepRunner({
      interactive,
    });

    // Create orchestrator
    this.orchestrator = new FlowOrchestrator(this.stepRunner);
  }

  /**
   * Execute a complete flow
   */
  public async execute(
    options: FlowExecutionOptions
  ): Promise<FlowExecutionResult> {
    const {
      taskId,
      flow,
      workspace,
      inputs,
      taskMetadata = {},
      claudeEnv,
      onClaudeProcessStarted,
    } = options;

    // Update step runner configuration with Claude env and callback
    this.stepRunner = new StepRunner({
      interactive: this.stepRunner['config'].interactive,
      claudeEnv,
      onClaudeProcessStarted,
    });

    // Recreate orchestrator with updated step runner
    this.orchestrator = new FlowOrchestrator(this.stepRunner);

    // Context for template rendering
    const stepOutputs = new Map<string, Record<string, any>>();
    const context: TemplateContext = {
      inputs,
      stepOutputs,
      taskMetadata,
    };

    // Orchestrate execution
    return this.orchestrator.orchestrate(taskId, flow, workspace, context);
  }
}
