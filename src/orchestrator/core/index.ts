import { TaskManager } from './TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { RestAPI } from './RestAPI.js';
import { renderUI } from '../ui.js';
import { Logger } from '../../shared/Logger.js';
import { FlowRegistry } from '../../flow/registry/FlowRegistry.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';
import {Shutdownable} from "../../shared/Shutdownable.js";

const REST_PORT = 3737;
const WS_PORT = 3738;

//TODO refactor into a class (like FlowWorker)

// Simple initialization like the working minimal test
let uiInstance: any;
let taskManager: TaskManager;
let wsServer: WorkerWebSocketServer | undefined;
let restAPI: RestAPI | undefined;
let flowRegistry: FlowRegistry | undefined;
let workspaceManager: WorkspaceManager | undefined;

const orchestrator = new class Orchestrator implements Shutdownable {
	shutdown(): void {
		const _ = stop();
	}
}

async function start() {
  console.log('Starting orchestrator...');
  process.title = 'Orchestrator';

  // Create core components
  taskManager = new TaskManager();
  wsServer = new WorkerWebSocketServer(taskManager, WS_PORT);
  flowRegistry = new FlowRegistry(process.cwd());
  workspaceManager = new WorkspaceManager(process.cwd());
  restAPI = new RestAPI(taskManager, wsServer, REST_PORT, flowRegistry, workspaceManager);
  
  // Load flows
  await flowRegistry.loadProjectFlows();
   flowRegistry.startWatching();

  // Start REST API
  await restAPI.start();

  // Start UI
  uiInstance = await renderUI(taskManager, orchestrator, wsServer);
  uiInstance.start();
}

async function stop() {
  if (uiInstance) {
    uiInstance.unmount();
  }

  Logger.log('[Orchestrator] Shutting down...');

  // Stop components
  flowRegistry?.stopWatching();
	Logger.log('[Orchestrator] flowRegistry Stopped');
  await restAPI?.stop();
	Logger.log('[Orchestrator] restAPI Stopped');
  await wsServer?.stop();
	Logger.log('[Orchestrator] wsServer Stopped');
  
  uiInstance.stop();
	Logger.log('[Orchestrator] uiInstance Stopped');

  Logger.log('[Orchestrator] Stopped');
  process.exit(0);
}


// Start the orchestrator
start().catch((error) => {
  console.error('[Orchestrator] Failed to start:', error);
  process.exit(1);
});

// Handle termination signals
process.on('SIGINT', async () => {
  console.log('\n[Orchestrator] Received SIGINT, shutting down gracefully...');
  // await stop();
  orchestrator.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Orchestrator] Received SIGTERM, shutting down gracefully...');
  // await stop();
  orchestrator.shutdown();
  process.exit(0);
});
