// UI Engine Selector for Orchestrator
// Chooses between Ink (React-based) and terminal-kit based on UI_ENGINE environment variable

import { TaskManager } from './core/TaskManager.js';
import { WorkerWebSocketServer } from './websocket/WorkerWebSocketServer.js';
import {Shutdownable} from "../shared/Shutdownable.js";

export async function renderUI(taskManager: TaskManager, shutdownable: Shutdownable, wsServer: WorkerWebSocketServer) {
  // const uiEngine = process.env.UI_ENGINE || 'ink';
  const uiEngine = process.env.UI_ENGINE || 'terminal-kit';

  if (uiEngine === 'terminal-kit') {
    // Use terminal-kit implementation
    const { renderUI: renderTerminalKitUI } = await import('./ui/terminal-kit/OrchestratorUI.js');
    return renderTerminalKitUI(taskManager, shutdownable, wsServer);
  } else {
    // Use Ink (React) implementation (default)
    const { renderUI: renderInkUI } = await import('./ui/ink/OrchestratorUI.js');
    return renderInkUI(taskManager, shutdownable, wsServer);
  }
}
