import { TaskManager } from './task-manager.js';
import { WorkerWebSocketServer } from './websocket-server.js';
import { RestAPI } from './rest-api.js';

const REST_PORT = 3737;
const WS_PORT = 3738;

class Orchestrator {
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private restAPI: RestAPI;

  constructor() {
    console.log('[Orchestrator] Initializing...');

    this.taskManager = new TaskManager();
    this.wsServer = new WorkerWebSocketServer(this.taskManager, WS_PORT);
    this.restAPI = new RestAPI(this.taskManager, this.wsServer, REST_PORT);
  }

  async start(): Promise<void> {
    process.title = 'Orchestrator';

    console.log('[Orchestrator] Starting servers...');

    // WebSocket server starts automatically in its constructor
    await this.restAPI.start();

    console.log('\n=================================================');
    console.log('🚀 Agent Fleet Orchestrator is running!');
    console.log('=================================================');
    console.log(`📡 REST API:     http://localhost:${REST_PORT}`);
    console.log(`🔌 WebSocket:    ws://localhost:${WS_PORT}`);
    console.log('=================================================\n');
    console.log('Available endpoints:');
    console.log(`  GET    /health                - Health check`);
    console.log(`  GET    /stats                 - System statistics`);
    console.log(`  POST   /tasks                 - Create a new task`);
    console.log(`  GET    /tasks                 - List all tasks`);
    console.log(`  GET    /tasks/:id             - Get task details`);
    console.log(`  PATCH  /tasks/:id/status      - Update task status`);
    console.log(`  POST   /tasks/:id/comments    - Add comment to task`);
    console.log(`  GET    /workers               - List connected workers\n`);
  }

  async stop(): Promise<void> {
    console.log('[Orchestrator] Shutting down...');
    await this.restAPI.stop();
    await this.wsServer.stop();
    console.log('[Orchestrator] Stopped');
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
