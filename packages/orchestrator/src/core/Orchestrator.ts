import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager';
import { InterventionManager } from 'orchestrator/core/InterventionManager';
import { RestAPI } from 'orchestrator/core/RestAPI';
import { TaskManager } from 'orchestrator/core/TaskManager';
import { MetricsCollector } from 'orchestrator/metrics/MetricsCollector';
import { StateSnapshotService } from 'orchestrator/state/StateSnapshotService';
import { UIClientHook } from 'orchestrator/ui-client/UIClientHook';
import { type OrchestratorSnapshot } from 'orchestrator/ui-client/types';
import { WorkerWebSocketServer } from 'orchestrator/websocket/WorkerWebSocketServer';
import { type Shutdownable } from 'shared-common/Shutdownable';
import { logger } from 'shared-common/logger';
import { StateManager } from 'shared-orch-worker/StateManager';

export type OrchestratorConfig = { restPort?: number; wsPort?: number; projectRoot?: string; libraryMode?: boolean };

/**
 * Orchestrator class that coordinates all services
 * Manages lifecycle of TaskManager, WebSocket server, REST API, and UI
 */
export class Orchestrator implements Shutdownable {
	private restPort: number;
	private wsPort: number;
	private projectRoot: string;
	private libraryMode: boolean;
	private stateManager: StateManager;
	private taskManager: TaskManager;
	private interventionManager?: InterventionManager;
	private wsServer?: WorkerWebSocketServer;
	private restAPI?: RestAPI;
	private workspaceManager?: WorkspaceManager;
	// private uiInstance?: any;
	private isRunning: boolean = false;

	// New UI-related services
	private snapshotService?: StateSnapshotService;
	private metricsCollector?: MetricsCollector;
	private uiClientHook?: UIClientHook;
	private startTime: Date;

	constructor(config?: OrchestratorConfig) {
		this.restPort = config?.restPort || Number(process.env.REST_PORT) || 3737;
		this.wsPort = config?.wsPort || Number(process.env.WS_PORT) || 3738;
		this.projectRoot = config?.projectRoot || process.cwd();
		this.libraryMode = config?.libraryMode ?? false;
		this.stateManager = new StateManager();
		this.taskManager = new TaskManager(this.stateManager);
		this.startTime = new Date();

		// Initialize Logger with StateManager
		// Logger.initialize(this.stateManager);

		logger.info(
			'Orchestrator',
			`Constructor: libraryMode=${this.libraryMode}, wsPort=${this.wsPort}, restPort=${this.restPort}`
		);
	}

	/**
	 * Initialize all components
	 */
	private async initialize(): Promise<void> {
		// Emit orchestrator started event
		this.stateManager.emitOrchestratorStarted();

		// Initialize TaskManager
		await this.taskManager.initialize();

		// Initialize InterventionManager
		this.interventionManager = new InterventionManager(this.taskManager);
		await this.interventionManager.loadPendingInterventions();
		logger.info('Orchestrator', 'InterventionManager initialized');

		// Create WebSocket server
		this.wsServer = new WorkerWebSocketServer(
			this.taskManager,
			this.stateManager,
			this.interventionManager,
			this.wsPort
		);

		// Wire up intervention response callback
		this.interventionManager.setSendResponseCallback((taskId, interventionId, response, timedOut, cancelled) => {
			return this.wsServer!.sendInterventionResponse(taskId, interventionId, response, timedOut, cancelled);
		});

		// Inject flow discovery registry into TaskManager for flow validation
		const flowRegistry = this.wsServer.getConnectionManager().getFlowDiscoveryRegistry();
		this.taskManager.setFlowDiscoveryRegistry(flowRegistry);

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
		logger.info('Orchestrator', 'UI client hook enabled');

		// Create REST API only if not in library mode
		// In library mode, the backend (Fastify) handles HTTP/WebSocket communication
		if (!this.libraryMode) {
			this.restAPI = new RestAPI(
				this.taskManager,
				this.wsServer,
				this.restPort,
				this.workspaceManager,
				this.uiClientHook
			);
		} else {
			logger.info('Orchestrator', 'REST API disabled (library mode)');
		}
	}

	/**
	 * Start the orchestrator and all services
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			throw new Error('Orchestrator is already running');
		}

		logger.info('[Orchestrator] Starting orchestrator...');
		process.title = 'Orchestrator';

		try {
			// Initialize all components
			await this.initialize();

			// Start REST API
			await this.restAPI?.start();

			// Start metrics collector
			this.metricsCollector?.start();

			// Render UI
			// this.uiInstance = await renderUI(this.taskManager, this, this.wsServer!, this.stateManager);

			this.isRunning = true;

			// Emit orchestrator ready event
			this.stateManager.emitOrchestratorReady();

			logger.info('[Orchestrator] Orchestrator started successfully');
			logger.info('Orchestrator', 'All services started successfully');
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
			logger.info('[Orchestrator] Already shut down, skipping');
			return;
		}

		logger.info('[Orchestrator] Shutting down...');

		// Emit orchestrator stopping event
		this.stateManager.emitOrchestratorStopping();

		this.isRunning = false;

		// Stop metrics collector
		this.metricsCollector?.stop();
		logger.info('[Orchestrator] MetricsCollector stopped');

		// Cleanup InterventionManager
		this.interventionManager?.cleanup();
		logger.info('[Orchestrator] InterventionManager cleaned up');

		// Disable UI client hook
		this.uiClientHook?.disable();
		logger.info('[Orchestrator] UIClientHook disabled');

		// // Unmount UI
		// if (this.uiInstance) {
		// 	this.uiInstance.unmount();
		// }

		// Stop REST API
		await this.restAPI?.stop();
		logger.info('[Orchestrator] restAPI Stopped');

		// Stop WebSocket server
		await this.wsServer?.stop();
		logger.info('[Orchestrator] wsServer Stopped');

		logger.info('[Orchestrator] Stopped');
	}

	getStartTime(): Date {
		return this.startTime;
	}

	/**
	 * Get the task manager instance
	 */
	getTaskManager(): TaskManager {
		return this.taskManager;
	}

	/**
	 * Get the intervention manager instance
	 */
	getInterventionManager(): InterventionManager | undefined {
		return this.interventionManager;
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
