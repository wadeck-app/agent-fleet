import { TaskManager } from './task-manager.js';
import { WorkerWebSocketServer } from './websocket-server.js';
import { RestAPI } from './rest-api.js';
import { renderUI } from './ui.js';
import { Logger } from '../shared/logger.js';

const REST_PORT = 3737;
const WS_PORT = 3738;

class Orchestrator {
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private restAPI: RestAPI;
  private uiInstance: any;

  constructor() {
    Logger.log('[Orchestrator] Initializing...');

    this.taskManager = new TaskManager();
    this.wsServer = new WorkerWebSocketServer(this.taskManager, WS_PORT);
    this.restAPI = new RestAPI(this.taskManager, this.wsServer, REST_PORT);
  }

  async start(): Promise<void> {
    process.title = 'Orchestrator';

    // WebSocket server starts automatically in its constructor
    await this.restAPI.start();

    // Render the UI
    this.uiInstance = renderUI(this.taskManager, this.wsServer);
  }

  async stop(): Promise<void> {
    // Unmount the UI first
    if (this.uiInstance) {
      this.uiInstance.unmount();
    }

    Logger.log('[Orchestrator] Shutting down...');
    await this.restAPI.stop();
    await this.wsServer.stop();
    Logger.log('[Orchestrator] Stopped');
  }
}

// Entry point
const orchestrator = new Orchestrator();

orchestrator.start().catch((error) => {
  console.error('[Orchestrator] Failed to start:', error);
  process.exit(1);
});

// Handle termination signals
process.on('SIGINT', async () => {
  console.log('\n[Orchestrator] Received SIGINT, shutting down gracefully...');
  await orchestrator.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Orchestrator] Received SIGTERM, shutting down gracefully...');
  await orchestrator.stop();
  process.exit(0);
});
