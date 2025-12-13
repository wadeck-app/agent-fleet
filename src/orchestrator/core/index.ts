import { TaskManager } from './TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { RestAPI } from './RestAPI.js';
import { renderUI } from '../ui.js';
import { Logger } from '../../shared/Logger.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';
import { Shutdownable } from "../../shared/Shutdownable.js";
import { StateManager } from '../../shared/StateManager.js';

/**
 * Orchestrator class that coordinates all services
 * Manages lifecycle of TaskManager, WebSocket server, REST API, and UI
 */
export class Orchestrator implements Shutdownable {
  private restPort: number;
  private wsPort: number;
  private projectRoot: string;
  private stateManager: StateManager;
  private taskManager: TaskManager;
  private wsServer?: WorkerWebSocketServer;
  private restAPI?: RestAPI;
  private workspaceManager?: WorkspaceManager;
  private uiInstance?: any;
  private isRunning: boolean = false;

  constructor(config?: {
    restPort?: number;
    wsPort?: number;
    projectRoot?: string;
  }) {
    this.restPort = config?.restPort || Number(process.env.REST_PORT) || 3737;
    this.wsPort = config?.wsPort || Number(process.env.WS_PORT) || 3738;
    this.projectRoot = config?.projectRoot || process.cwd();
    this.stateManager = new StateManager();
    this.taskManager = new TaskManager(this.stateManager);

    // Initialize Logger with StateManager
    Logger.initialize(this.stateManager);
  }

  /**
   * Initialize all components
   */
  private async initialize(): Promise<void> {
    // Initialize TaskManager
    await this.taskManager.initialize();

    // Create WebSocket server
    this.wsServer = new WorkerWebSocketServer(this.taskManager, this.stateManager, this.wsPort);

    // Create workspace manager
    this.workspaceManager = new WorkspaceManager(this.projectRoot);

    // Create REST API
    this.restAPI = new RestAPI(
      this.taskManager,
      this.wsServer,
      this.restPort,
      this.workspaceManager
    );
  }

  /**
   * Start the orchestrator and all services
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    console.log('[Orchestrator] Starting orchestrator...');
    process.title = 'Orchestrator';

    try {
      // Initialize all components
      await this.initialize();

      // Start REST API
      await this.restAPI?.start();

      // Render UI
      this.uiInstance = await renderUI(this.taskManager, this, this.wsServer!, this.stateManager);

      this.isRunning = true;
      console.log('[Orchestrator] Orchestrator started successfully');
    } catch (error) {
      console.error('[Orchestrator] Failed to start:', error);
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Shutdown the orchestrator and all services
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      Logger.log('[Orchestrator] Already shut down, skipping');
      return;
    }

    Logger.log('[Orchestrator] Shutting down...');
    this.isRunning = false;

    // Unmount UI first
    if (this.uiInstance) {
      this.uiInstance.unmount();
    }

    // Stop REST API
    await this.restAPI?.stop();
    Logger.log('[Orchestrator] restAPI Stopped');

    // Stop WebSocket server
    await this.wsServer?.stop();
    Logger.log('[Orchestrator] wsServer Stopped');

    Logger.log('[Orchestrator] Stopped');
  }

  /**
   * Get the task manager instance
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  /**
   * Get the WebSocket server instance
   */
  getWsServer(): WorkerWebSocketServer | undefined {
    return this.wsServer;
  }

  /**
   * Get the REST API instance
   */
  getRestAPI(): RestAPI | undefined {
    return this.restAPI;
  }

  /**
   * Get the workspace manager instance
   */
  getWorkspaceManager(): WorkspaceManager | undefined {
    return this.workspaceManager;
  }
}

/**
 * Main entry point for the orchestrator
 */
export async function main() {
  const orchestrator = new Orchestrator();

  // Handle termination signals with proper async/await
  const handleShutdown = async (signal: string) => {
    console.log(`\n[Orchestrator] Received ${signal}, shutting down gracefully...`);
    try {
      await orchestrator.shutdown();
      process.exit(0);
    } catch (error) {
      console.error('[Orchestrator] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

  // Start the orchestrator
  try {
    await orchestrator.start();
  } catch (error) {
    console.error('[Orchestrator] Failed to start:', error);
    process.exit(1);
  }
}

// Start if this is the main module
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}
