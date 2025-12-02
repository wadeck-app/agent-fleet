/**
 * Step Runner
 *
 * Executes individual flow steps (script and model types) with retry logic.
 */

import type {
  FlowStep,
  ScriptFlowStep,
  ModelFlowStep,
  StepTrace,
  Workspace,
} from '../types.js';
import { TemplateRenderer, type TemplateContext } from '../processing/TemplateRenderer.js';
import { ScriptExecutor } from './ScriptExecutor.js';
import { OutputExtractor } from '../processing/OutputExtractor.js';
import { ClaudeProcessManager } from '../processing/ClaudeProcessManager.js';

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
}

/**
 * Step Runner class
 */
export class StepRunner {
  private templateRenderer: TemplateRenderer;
  private scriptExecutor: ScriptExecutor;
  private outputExtractor: OutputExtractor;
  private claudeManager: ClaudeProcessManager;
  private config: StepRunnerConfig;

  constructor(config: StepRunnerConfig) {
    this.templateRenderer = new TemplateRenderer();
    this.scriptExecutor = new ScriptExecutor();
    this.outputExtractor = new OutputExtractor();
    this.claudeManager = new ClaudeProcessManager();
    this.config = config;
  }

  /**
   * Execute a step with retry logic
   */
  public async executeStep(
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
        let result: StepTrace;

        if (step.type === 'script') {
          result = await this.executeScriptStep(step, workspace, context, stepTrace);
        } else if (step.type === 'model') {
          result = await this.executeModelStep(step, workspace, context, stepTrace);
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

        if (
          result.exitCode !== 0 &&
          result.exitCode !== 1 &&
          result.exitCode !== null
        ) {
          stepTrace.error = `Claude exited with code ${result.exitCode}`;
          return stepTrace;
        }

        // Extract outputs
        stepTrace.outputs = this.outputExtractor.extract(
          result.response,
          step.output,
          step.id,
          { response: result.response }
        );

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
        stepTrace.outputs = this.outputExtractor.extract(
          result.stdout,
          step.output,
          step.id,
          {
            response: result.stdout,
            stdout: result.stdout,
            stderr: result.stderr,
          }
        );

        return stepTrace;
      }
    } catch (error) {
      stepTrace.endTime = Date.now();
      stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
      stepTrace.error =
        error instanceof Error ? error.message : String(error);
      return stepTrace;
    }
  }

  /**
   * Calculate backoff delay in milliseconds
   */
  private calculateBackoff(
    attempt: number,
    strategy: 'linear' | 'exponential'
  ): number {
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
