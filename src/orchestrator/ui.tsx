// UI Engine Selector for Orchestrator
// Chooses between Ink (React-based) and terminal-kit based on UI_ENGINE environment variable

import { TaskManager } from './core/TaskManager.js';
import { WorkerWebSocketServer } from './websocket/WorkerWebSocketServer.js';
import { Shutdownable } from "../shared/Shutdownable.js";
import { StateManager } from '../shared/StateManager.js';

export async function renderUI(taskManager: TaskManager, shutdownable: Shutdownable, wsServer: WorkerWebSocketServer, stateManager: StateManager) {
  const { renderUI: renderTerminalKitUI } = await import('./ui/OrchestratorUI.js');
  return renderTerminalKitUI(taskManager, shutdownable, wsServer, stateManager);
}
