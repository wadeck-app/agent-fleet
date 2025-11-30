/**
 * Flow Executor
 *
 * Executes flows step-by-step.
 *
 * Current features:
 * - Script steps with shell command execution
 * - Variable interpolation in prompts/scripts
 * - Output extraction with transforms
 * - Conditional transitions (next.conditions)
 * - Retry logic with linear/exponential backoff
 * - Execution tracing
 *
 * Future versions will add:
 * - Model step execution
 * - Output validation contracts (pre/post-process)
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  FlowDefinition,
  FlowStep,
  ScriptFlowStep,
  FlowExecutionResult,
  FlowTrace,
  StepTrace,
  Workspace,
} from './types.js';
import { TemplateRenderer, type TemplateContext } from './template-renderer.js';
import { ScriptExecutor } from './script-executor.js';
import { OutputExtractor } from './output-extractor.js';
import { ConditionEvaluator } from './condition-evaluator.js';

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
 * Flow Executor class
 */
export class FlowExecutor {
  private templateRenderer: TemplateRenderer;
  private scriptExecutor: ScriptExecutor;
  private outputExtractor: OutputExtractor;
  private conditionEvaluator: ConditionEvaluator;

  constructor() {
    this.templateRenderer = new TemplateRenderer();
    this.scriptExecutor = new ScriptExecutor();
    this.outputExtractor = new OutputExtractor();
    this.conditionEvaluator = new ConditionEvaluator();
  }

  /**
   * Execute a complete flow
   *
   * @param options - Execution options
   * @returns Execution result with trace
   */
  public async execute(
    options: FlowExecutionOptions
  ): Promise<FlowExecutionResult> {
    const { taskId, flow, workspace, inputs, taskMetadata = {} } = options;

    // Initialize trace
    const trace: FlowTrace = {
      id: uuidv4(),
      taskId,
      flowId: flow.id,
      workspaceId: workspace.id,
      startTime: Date.now(),
      status: 'running',
      steps: [],
    };

    // Context for template rendering
    const stepOutputs = new Map<string, Record<string, any>>();
    const context: TemplateContext = {
      inputs,
      stepOutputs,
      taskMetadata,
    };

    try {
      // Find first step
      let currentStepId: string | null | undefined = flow.steps[0]?.id;

      // Execute steps sequentially
      while (currentStepId) {
        const step = this.findStep(flow, currentStepId);
        if (!step) {
          throw new FlowExecutionError(
            `Step '${currentStepId}' not found`,
            flow.id,
            currentStepId
          );
        }

        // Execute step
        const stepTrace = await this.executeStep(step, workspace, context);
        trace.steps.push(stepTrace);

        // Store outputs
        if (stepTrace.outputs) {
          stepOutputs.set(step.id, stepTrace.outputs);
        }

        // Check for errors
        if (stepTrace.error) {
          trace.status = 'failed';
          trace.endTime = Date.now();
          return {
            success: false,
            trace,
            error: stepTrace.error,
            outputs: this.mapToObject(stepOutputs),
          };
        }

        // Determine next step
        currentStepId = this.getNextStepId(step, stepTrace.outputs || {}, context);
      }

      // Success!
      trace.status = 'completed';
      trace.endTime = Date.now();

      return {
        success: true,
        trace,
        outputs: this.mapToObject(stepOutputs),
      };
    } catch (error) {
      trace.status = 'failed';
      trace.endTime = Date.now();

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        trace,
        error: errorMessage,
        outputs: this.mapToObject(stepOutputs),
      };
    }
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStep(
    step: FlowStep,
    workspace: Workspace,
    context: TemplateContext
  ): Promise<StepTrace> {
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
        if (step.type === 'script') {
          const result = await this.executeScriptStep(step, workspace, context, stepTrace);

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
        } else {
          // Model steps not implemented yet
          throw new FlowExecutionError(
            'Model steps not yet implemented',
            'unknown',
            step.id
          );
        }
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
   * Execute a script step
   */
  private async executeScriptStep(
    step: ScriptFlowStep,
    workspace: Workspace,
    context: TemplateContext,
    stepTrace: StepTrace
  ): Promise<StepTrace> {
    // Render script with variable interpolation
    const renderedScript = this.templateRenderer.render(
      step.script,
      context,
      true
    );

    stepTrace.script = renderedScript;

    // Execute script
    const workingDir = step.workingDir || workspace.path;
    const result = await this.scriptExecutor.execute({
      script: renderedScript,
      workingDir,
      env: step.env,
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

    const outputs = this.outputExtractor.extract(
      result.stdout,
      step.output,
      step.id,
      additionalContext
    );

    stepTrace.outputs = outputs;

    // Mark as error if script failed
    if (!result.success) {
      stepTrace.error = `Script exited with code ${result.exitCode}`;
    }

    return stepTrace;
  }

  /**
   * Find a step by ID
   */
  private findStep(flow: FlowDefinition, stepId: string): FlowStep | undefined {
    return flow.steps.find((s) => s.id === stepId);
  }

  /**
   * Determine the next step ID to execute
   * Evaluates conditions if present, otherwise uses default
   */
  private getNextStepId(
    step: FlowStep,
    outputs: Record<string, any>,
    context: TemplateContext
  ): string | null {
    if (!step.next) {
      return null;
    }

    // Evaluate conditions if present
    if (step.next.conditions && step.next.conditions.length > 0) {
      const conditionContext = {
        output: outputs,
        inputs: context.inputs,
        task: context.taskMetadata,
      };

      const matchedGoto = this.conditionEvaluator.evaluateConditions(
        step.next.conditions,
        conditionContext,
        step.id
      );

      if (matchedGoto) {
        return matchedGoto;
      }
    }

    // Fall back to default
    return step.next.default || null;
  }

  /**
   * Convert Map to plain object for serialization
   */
  private mapToObject(
    map: Map<string, Record<string, any>>
  ): Record<string, Record<string, any>> {
    const obj: Record<string, Record<string, any>> = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    return obj;
  }
}
