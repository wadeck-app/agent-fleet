/**
 * Flow Executor
 *
 * Executes flows step-by-step.
 *
 * Features:
 * - Script steps with shell command execution
 * - Model steps with Claude Code execution (interactive and background modes)
 * - Variable interpolation in prompts/scripts
 * - Output extraction with transforms
 * - Conditional transitions (next.conditions)
 * - Retry logic with linear/exponential backoff
 * - Execution tracing
 *
 * Future versions will add:
 * - Output validation contracts (pre/post-process)
 */

import { v4 as uuidv4 } from 'uuid';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type {
  FlowDefinition,
  FlowStep,
  ScriptFlowStep,
  ModelFlowStep,
  FlowExecutionResult,
  FlowTrace,
  StepTrace,
  Workspace,
  DAG,
} from './types.js';
import { TemplateRenderer, type TemplateContext } from './template-renderer.js';
import { ScriptExecutor } from './script-executor.js';
import { OutputExtractor } from './output-extractor.js';
import { DAGBuilder } from './dag-builder.js';
import { DAGValidator } from './dag-validator.js';

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
  private dagBuilder: DAGBuilder;
  private dagValidator: DAGValidator;
  private interactive: boolean;
  private currentClaudeEnv?: Record<string, string>;
  private currentOnClaudeProcessStarted?: (process: any) => void;

  constructor(interactive: boolean = false) {
    this.templateRenderer = new TemplateRenderer();
    this.scriptExecutor = new ScriptExecutor();
    this.outputExtractor = new OutputExtractor();
    this.dagBuilder = new DAGBuilder();
    this.dagValidator = new DAGValidator();
    this.interactive = interactive;
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
    const { taskId, flow, workspace, inputs, taskMetadata = {}, claudeEnv, onClaudeProcessStarted } = options;

    // Store callbacks for use in executeModelStep
    this.currentClaudeEnv = claudeEnv;
    this.currentOnClaudeProcessStarted = onClaudeProcessStarted;

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
      // Build and validate DAG
      const dag = this.dagBuilder.buildDAG(flow.steps);
      const validation = this.dagValidator.validate(dag);

      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('; ');
        throw new FlowExecutionError(
          `DAG validation failed: ${errorMessages}`,
          flow.id
        );
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn(`⚠️  DAG validation warnings for flow '${flow.id}':`);
        for (const warning of validation.warnings) {
          console.warn(`   - ${warning.message}`);
        }
      }

      // Track completed steps
      const completed = new Set<string>();

      // Execute steps in parallel based on DAG dependencies
      while (completed.size < flow.steps.length) {
        // Find all steps whose dependencies are met
        const ready = this.dagBuilder.findReadySteps(dag, completed);

        if (ready.length === 0) {
          // No ready steps means there's an issue (shouldn't happen if validation passed)
          const remaining = flow.steps.filter((s) => !completed.has(s.id));
          throw new FlowExecutionError(
            `No steps ready to execute, but ${remaining.length} steps remain: ${remaining.map(s => s.id).join(', ')}`,
            flow.id
          );
        }

        console.log(`\n▶️  Executing ${ready.length} step(s) in parallel: ${ready.map(s => s.id).join(', ')}`);

        // Execute ready steps in parallel
        const stepTraces = await Promise.all(
          ready.map((step) => this.executeStep(step, workspace, context))
        );

        // Process results
        for (let i = 0; i < ready.length; i++) {
          const step = ready[i];
          const stepTrace = stepTraces[i];

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
              error: `Step '${step.id}' failed: ${stepTrace.error}`,
              outputs: this.mapToObject(stepOutputs),
            };
          }

          // Mark as completed
          completed.add(step.id);
        }
      }

      // Success!
      trace.status = 'completed';
      trace.endTime = Date.now();

      console.log(`\n✅ Flow '${flow.id}' completed successfully! Executed ${completed.size} steps.`);

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
        } else if (step.type === 'model') {
          const result = await this.executeModelStep(step, workspace, context, stepTrace);

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
          throw new FlowExecutionError(
            `Unknown step type: ${(step as any).type}`,
            'unknown',
            (step as any).id
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
   * Execute a model step (launches Claude)
   */
  private async executeModelStep(
    step: ModelFlowStep,
    workspace: Workspace,
    context: TemplateContext,
    stepTrace: StepTrace
  ): Promise<StepTrace> {
    // Render prompt with variable interpolation
    const renderedPrompt = this.templateRenderer.render(
      step.prompt,
      context,
      true
    );

    stepTrace.prompt = renderedPrompt;
    stepTrace.model = step.model;

    // Find Claude executable
    const claudePath = this.findClaudePath();

    // Create temp prompt file
    const tempPromptFile = path.join(workspace.path, `.agent-fleet-prompt-${step.id}.txt`);
    fs.writeFileSync(tempPromptFile, renderedPrompt, 'utf8');

    try {
      // Launch Claude
      let command: string;
      let args: string[];

      if (this.interactive) {
        // Interactive mode: Claude takes over the terminal
        if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
          command = 'cmd.exe';
          args = ['/c', claudePath, '--dangerously-skip-permissions'];
          if (step.model) {
            args.push('--model', step.model);
          }
          args.push(renderedPrompt);
        } else {
          command = claudePath;
          args = ['--dangerously-skip-permissions'];
          if (step.model) {
            args.push('--model', step.model);
          }
          args.push(renderedPrompt);
        }

        console.log(`\n🤖 Launching Claude (${step.model}) in interactive mode...`);
        console.log(`💬 Prompt: ${renderedPrompt.substring(0, 100)}${renderedPrompt.length > 100 ? '...' : ''}\n`);

        const result = await this.launchClaudeInteractive(command, args, workspace.path);

        stepTrace.response = result.response;
        stepTrace.exitCode = result.exitCode ?? undefined;
        stepTrace.endTime = Date.now();
        stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;

        if (result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null) {
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
        // Background mode: Capture output
        if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
          command = 'cmd.exe';
          args = ['/c', claudePath, '--dangerously-skip-permissions'];
          if (step.model) {
            args.push('--model', step.model);
          }
          args.push('-p', tempPromptFile);
        } else {
          command = claudePath;
          args = ['--dangerously-skip-permissions'];
          if (step.model) {
            args.push('--model', step.model);
          }
          args.push('-p', tempPromptFile);
        }

        console.log(`🤖 Launching Claude (${step.model}) in background mode...`);

        const result = await this.launchClaudeBackground(command, args, workspace.path);

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
          { response: result.stdout, stdout: result.stdout, stderr: result.stderr }
        );

        return stepTrace;
      }
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempPromptFile)) {
        fs.unlinkSync(tempPromptFile);
      }
    }
  }

  /**
   * Find Claude executable path
   */
  private findClaudePath(): string {
    try {
      if (process.platform === 'win32') {
        const result = execSync('where claude', { encoding: 'utf8' }).trim();
        const paths = result.split('\n').map(p => p.trim());
        const cmdPath = paths.find(p => p.endsWith('.cmd'));
        if (cmdPath) return cmdPath;
        const batPath = paths.find(p => p.endsWith('.bat'));
        if (batPath) return batPath;
        return paths[0];
      } else {
        return execSync('which claude', { encoding: 'utf8' }).trim();
      }
    } catch (error) {
      console.warn('Could not find claude in PATH, using "claude" as fallback');
      return 'claude';
    }
  }

  /**
   * Launch Claude in interactive mode (stdio: inherit)
   */
  private async launchClaudeInteractive(
    command: string,
    args: string[],
    workingDir: string
  ): Promise<{ response: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(command, args, {
        cwd: workingDir,
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          ...this.currentClaudeEnv
        }
      });

      // Call callback to store process reference
      if (this.currentOnClaudeProcessStarted) {
        this.currentOnClaudeProcessStarted(claudeProcess);
      }

      claudeProcess.on('close', (code) => {
        resolve({
          response: '', // Interactive mode doesn't capture output
          exitCode: code
        });
      });

      claudeProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Launch Claude in background mode (capture output)
   */
  private async launchClaudeBackground(
    command: string,
    args: string[],
    workingDir: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(command, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: {
          ...process.env,
          ...this.currentClaudeEnv
        }
      });

      // Call callback to store process reference
      if (this.currentOnClaudeProcessStarted) {
        this.currentOnClaudeProcessStarted(claudeProcess);
      }

      // Close stdin immediately
      if (claudeProcess.stdin) {
        claudeProcess.stdin.end();
      }

      let stdout = '';
      let stderr = '';

      claudeProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[Claude] ${output.trim()}`);
      });

      claudeProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[Claude Error] ${output.trim()}`);
      });

      claudeProcess.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      claudeProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Convert Map to plain object for serialization
   */
  private mapToObject(
    map: Map<string, Record<string, any>>
  ): Record<string, Record<string, any>> {
    const obj: Record<string, Record<string, any>> = {};
    for (const [key, value] of Array.from(map.entries())) {
      obj[key] = value;
    }
    return obj;
  }
}
