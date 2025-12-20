/**
 * Worker UI Manager
 *
 * Coordinates UI updates and manages UI lifecycle.
 * Handles step status updates and UI state management.
 */

import { FlowWorkerUI as TerminalKitFlowWorkerUI, createFlowWorkerUI as createTerminalKitUI } from './ui/terminal-kit/FlowWorkerUI.js';
import type { UIStateManager } from './ui/shared/StateManager.js';
import type { StepInfo } from './ui/shared/types.js';
import type { FlowStep } from 'flow-engine/types.js';
import type { Shutdownable } from 'shared-common/Shutdownable.js';

// Type alias for UI interface (both implementations share the same interface)
type FlowWorkerUI = TerminalKitFlowWorkerUI;

/**
 * Worker UI Manager class
 */
export class WorkerUIManager {
  private ui: FlowWorkerUI | null = null;
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Initialize the UI
   */
  initialize(workerId: string, orchestratorUrl: string, shutdownable: Shutdownable): void {
    if (!this.enabled) return;

    this.ui = createTerminalKitUI(workerId, orchestratorUrl, shutdownable);
  }

  /**
   * Start the UI (call after connection is established)
   */
  start(): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    stateManager.setConnected(true);
    this.ui.start();
  }

  /**
   * Stop the UI
   */
  stop(): void {
    if (!this.enabled || !this.ui) return;

    console.log('[WorkerUIManager] Stopping UI...');
    this.ui.stop();
    this.ui = null;
  }

  /**
   * Get the state manager for direct access
   */
  getStateManager(): UIStateManager | null {
    return this.ui ? this.ui.getStateManager() : null;
  }

  /**
   * Update worker ID (called after receiving welcome from orchestrator)
   */
  updateWorkerId(workerId: string): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    stateManager.setWorkerId(workerId);
  }

  /**
   * Update connection status
   */
  setConnected(connected: boolean): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    stateManager.setConnected(connected);
  }

  /**
   * Start a new task
   */
  startTask(taskId: string, flowId: string, flowName: string, steps: FlowStep[]): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    const stepInfos = steps.map(step => this.convertStepToStepInfo(step));
    stateManager.startTask(taskId, flowId, flowName, stepInfos);
  }

  /**
   * Set workspace directory
   */
  setWorkspace(workspacePath: string): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    stateManager.setWorkspace(workspacePath);
  }

  /**
   * Mark task as completed
   */
  taskCompleted(): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    stateManager.taskCompleted();
  }

  /**
   * Mark task as failed
   */
  taskFailed(error: string): void {
    if (!this.enabled || !this.ui) return;

    const stateManager = this.ui.getStateManager();
    stateManager.taskFailed(error);
  }

  /**
   * Convert FlowStep to StepInfo for UI
   */
  private convertStepToStepInfo(step: FlowStep): StepInfo {
    return {
      id: step.id,
      name: step.name,
      type: step.type,
      status: 'pending',
    };
  }

  /**
   * Check if UI is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
