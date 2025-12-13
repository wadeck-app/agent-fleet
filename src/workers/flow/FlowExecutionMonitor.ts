/**
 * Flow Execution Monitor
 *
 * Monitors flow execution using event-driven approach.
 * Listens to FlowOrchestrator events and emits UI update events.
 */

import { EventEmitter } from 'events';
import type { Task } from '../../shared/types.js';
import type { UIStateManager } from './ui/shared/StateManager.js';

/**
 * Events emitted by FlowOrchestrator during execution
 */
export interface FlowExecutionEvents {
  'step:started': { stepId: string; retries: number };
  'step:completed': { stepId: string; durationMs: number };
  'step:failed': { stepId: string; error: string; durationMs: number };
  'step:output': { stepId: string; output: string };
  'flow:progress': { message: string };
}

/**
 * Flow Execution Monitor class
 */
export class FlowExecutionMonitor extends EventEmitter {
  private currentTask: Task | null = null;
  private stateManager: UIStateManager | null = null;
  private trackedSteps = new Set<string>();

  constructor() {
    super();
  }

  /**
   * Set the state manager for UI updates
   */
  setStateManager(stateManager: UIStateManager | null): void {
    this.stateManager = stateManager;
  }

  /**
   * Start monitoring a task
   */
  startMonitoring(task: Task): void {
    this.currentTask = task;
    this.trackedSteps.clear();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.currentTask = null;
    this.trackedSteps.clear();
  }

  /**
   * Handle step started event
   */
  onStepStarted(stepId: string, retries: number = 0): void {
    if (!this.stateManager) return;

    const stepKey = `${stepId}-started`;
    if (!this.trackedSteps.has(stepKey)) {
      this.trackedSteps.add(stepKey);
      this.stateManager.stepStarted(stepId, retries);
    }
  }

  /**
   * Handle step completed event
   */
  onStepCompleted(stepId: string, durationMs: number): void {
    if (!this.stateManager) return;

    const stepKey = `${stepId}-completed`;
    if (!this.trackedSteps.has(stepKey)) {
      this.trackedSteps.add(stepKey);
      this.stateManager.stepCompleted(stepId, durationMs);
    }
  }

  /**
   * Handle step failed event
   */
  onStepFailed(stepId: string, error: string, durationMs: number): void {
    if (!this.stateManager) return;

    const stepKey = `${stepId}-failed`;
    if (!this.trackedSteps.has(stepKey)) {
      this.trackedSteps.add(stepKey);
      this.stateManager.stepFailed(stepId, error, durationMs);
    }
  }

  /**
   * Handle step output event
   */
  onStepOutput(stepId: string, output: string): void {
    if (!this.stateManager) return;
    this.stateManager.addStepOutput(stepId, output);
  }

  /**
   * Monitor task execution from flowResult trace (fallback for non-event-driven execution)
   */
  monitorTaskTrace(task: Task): void {
    if (!this.stateManager || !task.flowResult?.trace) return;

    const trace = task.flowResult.trace;
    const lastStepCount = this.trackedSteps.size;

    // Update steps based on trace
    if (trace.steps && trace.steps.length > lastStepCount) {
      const newSteps = trace.steps.slice(lastStepCount);

      for (const traceStep of newSteps) {
        const stepKey = `${traceStep.stepId}-${traceStep.startTime}`;

        if (!this.trackedSteps.has(stepKey)) {
          this.trackedSteps.add(stepKey);

          // Step started
          this.stateManager.stepStarted(traceStep.stepId, traceStep.retries);

          // Add step output if available
          if (traceStep.stdout) {
            this.stateManager.addStepOutput(traceStep.stepId, traceStep.stdout);
          }

          // Step completed or failed
          if (traceStep.endTime) {
            const duration = traceStep.durationMs || (traceStep.endTime - traceStep.startTime);

            if (traceStep.error) {
              this.stateManager.stepFailed(traceStep.stepId, traceStep.error, duration);
            } else {
              this.stateManager.stepCompleted(traceStep.stepId, duration);
            }
          }
        }
      }
    }
  }
}
