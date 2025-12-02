/**
 * Flow Orchestrator
 *
 * Orchestrates the execution of flow steps based on DAG dependencies.
 * Handles parallel execution, loop logic, and output management.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  FlowDefinition,
  FlowStep,
  FlowTrace,
  StepTrace,
  Workspace,
  DAG,
  FlowExecutionResult,
} from '../types.js';
import type { TemplateContext } from '../processing/TemplateRenderer.js';
import { DAGBuilder } from '../validation/DAGBuilder.js';
import { DAGValidator } from '../validation/DAGValidator.js';
import { LoopHandler } from '../processing/LoopHandler.js';
import { StepRunner } from './StepRunner.js';

/**
 * Orchestration error
 */
export class OrchestrationError extends Error {
  constructor(
    message: string,
    public flowId: string
  ) {
    super(`Flow orchestration error in '${flowId}': ${message}`);
    this.name = 'OrchestrationError';
  }
}

/**
 * Flow Orchestrator class
 */
export class FlowOrchestrator {
  private dagBuilder: DAGBuilder;
  private dagValidator: DAGValidator;
  private loopHandler: LoopHandler;
  private stepRunner: StepRunner;

  constructor(stepRunner: StepRunner) {
    this.dagBuilder = new DAGBuilder();
    this.dagValidator = new DAGValidator();
    this.loopHandler = new LoopHandler();
    this.stepRunner = stepRunner;
  }

  /**
   * Orchestrate flow execution
   */
  public async orchestrate(
    taskId: string,
    flow: FlowDefinition,
    workspace: Workspace,
    context: TemplateContext
  ): Promise<FlowExecutionResult> {
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

    // Step outputs map
    const stepOutputs = context.stepOutputs;

    try {
      // Build and validate DAG
      const dag = this.dagBuilder.buildDAG(flow.steps);
      const validation = this.dagValidator.validate(dag);

      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('; ');
        throw new OrchestrationError(
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

      // Execute flow
      const result = await this.executeFlow(
        flow,
        dag,
        workspace,
        context,
        trace,
        stepOutputs
      );

      return result;
    } catch (error) {
      trace.status = 'failed';
      trace.endTime = Date.now();

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        trace,
        error: errorMessage,
        outputs: this.mapToObject(stepOutputs),
      };
    }
  }

  /**
   * Execute flow with DAG-based parallelization
   */
  private async executeFlow(
    flow: FlowDefinition,
    dag: DAG,
    workspace: Workspace,
    context: TemplateContext,
    trace: FlowTrace,
    stepOutputs: Map<string, Record<string, any>>
  ): Promise<FlowExecutionResult> {
    // Track completed steps
    const completed = new Set<string>();

    // Track loop metadata
    const iterations = new Map<string, number>();

    // Execute steps in parallel based on DAG dependencies
    while (completed.size < flow.steps.length) {
      // Find all steps whose dependencies are met
      const ready = this.dagBuilder.findReadySteps(dag, completed);

      if (ready.length === 0) {
        // No ready steps means there's an issue (shouldn't happen if validation passed)
        const remaining = flow.steps.filter((s) => !completed.has(s.id));
        throw new OrchestrationError(
          `No steps ready to execute, but ${remaining.length} steps remain: ${remaining
            .map((s) => s.id)
            .join(', ')}`,
          flow.id
        );
      }

      // Log execution
      const startTime = Date.now();
      this.logStepExecution(ready, startTime);

      // Execute ready steps in parallel
      const stepTraces = await Promise.all(
        ready.map((step) => this.stepRunner.executeStep(step, workspace, context))
      );

      // Log completion
      const endTime = Date.now();
      this.logStepCompletion(startTime, endTime);

      // Process results
      const shouldContinue = this.processStepResults(
        ready,
        stepTraces,
        flow,
        dag,
        trace,
        stepOutputs,
        completed,
        iterations
      );

      if (!shouldContinue.continue) {
        // Flow failed or needs to loop
        if (shouldContinue.result) {
          return shouldContinue.result;
        }
        // Loop - continue to next iteration
        continue;
      }
    }

    // Success!
    trace.status = 'completed';
    trace.endTime = Date.now();

    console.log(
      `\n✅ Flow '${flow.id}' completed successfully! Executed ${completed.size} steps.`
    );

    return {
      success: true,
      trace,
      outputs: this.mapToObject(stepOutputs),
    };
  }

  /**
   * Process step execution results
   */
  private processStepResults(
    ready: FlowStep[],
    stepTraces: StepTrace[],
    flow: FlowDefinition,
    dag: DAG,
    trace: FlowTrace,
    stepOutputs: Map<string, Record<string, any>>,
    completed: Set<string>,
    iterations: Map<string, number>
  ): { continue: boolean; result?: FlowExecutionResult } {
    for (let i = 0; i < ready.length; i++) {
      const step = ready[i];
      const stepTrace = stepTraces[i];

      trace.steps.push(stepTrace);

      // Store outputs
      if (stepTrace.outputs) {
        stepOutputs.set(step.id, stepTrace.outputs);
      }

      // Check for errors and potential loops
      if (stepTrace.error) {
        // Check if this failure should trigger a loop
        const loopCheck = this.loopHandler.checkLoop(step, stepTrace, iterations);

        if (loopCheck.shouldLoop && loopCheck.targetStepId) {
          // Handle the loop
          const loopResult = this.loopHandler.handleLoop(
            step,
            loopCheck.targetStepId,
            dag,
            completed,
            iterations
          );

          if (!loopResult.success) {
            // Loop handling failed
            trace.status = 'failed';
            trace.endTime = Date.now();
            return {
              continue: false,
              result: {
                success: false,
                trace,
                error: `Loop handling failed: ${loopResult.error}`,
                outputs: this.mapToObject(stepOutputs),
              },
            };
          }

          // Loop triggered - do NOT mark step as completed
          // Continue to next iteration
          return { continue: false };
        } else {
          // No loop to trigger, or max iterations exceeded
          trace.status = 'failed';
          trace.endTime = Date.now();

          const errorMsg = loopCheck.reason?.includes('Max iterations')
            ? `Step '${step.id}' failed: ${stepTrace.error}. ${loopCheck.reason}`
            : `Step '${step.id}' failed: ${stepTrace.error}`;

          return {
            continue: false,
            result: {
              success: false,
              trace,
              error: errorMsg,
              outputs: this.mapToObject(stepOutputs),
            },
          };
        }
      }

      // Step completed successfully
      // Check if this step's success should reset any iteration counters
      this.loopHandler.handleResetOnSuccess(step.id, flow.steps, iterations);

      // Mark as completed
      completed.add(step.id);
    }

    return { continue: true };
  }

  /**
   * Log step execution start
   */
  private logStepExecution(ready: FlowStep[], startTime: number): void {
    const startDate = new Date(startTime);
    const startTimeStr = `${startDate
      .getHours()
      .toString()
      .padStart(2, '0')}:${startDate
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${startDate
      .getSeconds()
      .toString()
      .padStart(2, '0')}.${startDate.getMilliseconds().toString().padStart(3, '0')}`;

    console.log(
      `\n▶️  [${startTimeStr}] Executing ${ready.length} step(s) in parallel: ${ready
        .map((s) => s.id)
        .join(', ')}`
    );
  }

  /**
   * Log step execution completion
   */
  private logStepCompletion(startTime: number, endTime: number): void {
    const endDate = new Date(endTime);
    const endTimeStr = `${endDate
      .getHours()
      .toString()
      .padStart(2, '0')}:${endDate
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${endDate
      .getSeconds()
      .toString()
      .padStart(2, '0')}.${endDate.getMilliseconds().toString().padStart(3, '0')}`;

    const duration = ((endTime - startTime) / 1000).toFixed(3);
    console.log(`   ⏱️  [${endTimeStr}] Completed in ${duration}s`);
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
