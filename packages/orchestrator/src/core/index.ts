import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager.js';
import { Logger } from 'shared-common/Logger.js';
import { Shutdownable } from 'shared-common/Shutdownable.js';
import { StateManager } from 'shared-common/StateManager.js';

import { MetricsCollector } from '../metrics/MetricsCollector.js';
import { StateSnapshotService } from '../state/StateSnapshotService.js';
import { UIClientHook } from '../ui-client/UIClientHook.js';
import { OrchestratorSnapshot } from '../ui-client/types.js';
import { renderUI } from '../ui.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { RestAPI } from './RestAPI.js';
import { TaskManager } from './TaskManager.js';

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

	// New UI-related services
	private snapshotService?: StateSnapshotService;
	private metricsCollector?: MetricsCollector;
	private uiClientHook?: UIClientHook;
	private startTime: Date;

	constructor(config?: { restPort?: number; wsPort?: number; projectRoot?: string }) {
		this.restPort = config?.restPort || Number(process.env.REST_PORT) || 3737;
		this.wsPort = config?.wsPort || Number(process.env.WS_PORT) || 3738;
		this.projectRoot = config?.projectRoot || process.cwd();
		this.stateManager = new StateManager();
		this.taskManager = new TaskManager(this.stateManager);
		this.startTime = new Date();

		// Initialize Logger with StateManager
		Logger.initialize(this.stateManager);
	}

	/**
	 * Initialize all components
	 */
	private async initialize(): Promise<void> {
		// Emit orchestrator started event
		this.stateManager.emitOrchestratorStarted();

		// Initialize TaskManager
		await this.taskManager.initialize();

		// Create WebSocket server
		this.wsServer = new WorkerWebSocketServer(this.taskManager, this.stateManager, this.wsPort);

		// Create workspace manager
		this.workspaceManager = new WorkspaceManager(this.projectRoot);

		// Initialize new UI-related services
		this.snapshotService = new StateSnapshotService(this.taskManager, this.wsServer);

		this.metricsCollector = new MetricsCollector(
			this.taskManager,
			this.wsServer,
			this.stateManager,
			5000 // Collect metrics every 5 seconds
		);

		this.uiClientHook = new UIClientHook(this.stateManager);

		// Always enable UI client hook
		this.uiClientHook.enable();
		Logger.logStructured('info', 'Orchestrator', 'UI client hook enabled');

		// Create REST API with UIClientHook for WebSocket support
		this.restAPI = new RestAPI(
			this.taskManager,
			this.wsServer,
			this.restPort,
			this.workspaceManager,
			this.uiClientHook
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

			// Start metrics collector
			this.metricsCollector?.start();

			// Render UI
			this.uiInstance = await renderUI(this.taskManager, this, this.wsServer!, this.stateManager);

			this.isRunning = true;

			// Emit orchestrator ready event
			this.stateManager.emitOrchestratorReady();

			console.log('[Orchestrator] Orchestrator started successfully');
			Logger.logStructured('info', 'Orchestrator', 'All services started successfully');
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

		// Emit orchestrator stopping event
		this.stateManager.emitOrchestratorStopping();

		this.isRunning = false;

		// Stop metrics collector
		this.metricsCollector?.stop();
		Logger.log('[Orchestrator] MetricsCollector stopped');

		// Disable UI client hook
		this.uiClientHook?.disable();
		Logger.log('[Orchestrator] UIClientHook disabled');

		// Unmount UI
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

	/**
	 * Get the state snapshot service instance
	 */
	getSnapshotService(): StateSnapshotService | undefined {
		return this.snapshotService;
	}

	/**
	 * Get the metrics collector instance
	 */
	getMetricsCollector(): MetricsCollector | undefined {
		return this.metricsCollector;
	}

	/**
	 * Get the UI client hook instance
	 */
	getUIClientHook(): UIClientHook | undefined {
		return this.uiClientHook;
	}

	/**
	 * Get current state snapshot (for UI connections)
	 */
	getStateSnapshot(): OrchestratorSnapshot | undefined {
		return this.snapshotService?.getSnapshot();
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
