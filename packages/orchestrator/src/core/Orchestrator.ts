import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager';
import { BackendEventBridge } from 'orchestrator/core/BackendEventBridge';
import { InterventionManager } from 'orchestrator/core/InterventionManager';
import { RestAPI } from 'orchestrator/core/RestAPI';
import { TaskManager } from 'orchestrator/core/TaskManager';
import { WorkerCoordinator } from 'orchestrator/core/WorkerCoordinator';
import { MetricsCollector } from 'orchestrator/metrics/MetricsCollector';
import { EventSubscriptionRegistry } from 'orchestrator/registry/EventSubscriptionRegistry';
import { StateSnapshotService } from 'orchestrator/state/StateSnapshotService';
import { WorkerWebSocketServer } from 'orchestrator/websocket/WorkerWebSocketServer';
import { type Shutdownable } from 'shared-common/Shutdownable';
import { createLogger } from 'shared-common/logger';
import { StateManager } from 'shared-orch-worker/StateManager';

import { FileBasedOrchestratorStorage } from '../storage/FileBasedOrchestratorStorage';
import type { IOrchestratorStorage } from '../storage/IOrchestratorStorage';

const log = createLogger('Orchestrator');

export type OrchestratorConfig = {
	restPort?: number;
	wsPort?: number;
	projectRoot?: string;
	libraryMode?: boolean;
	storage?: IOrchestratorStorage;
};

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
	private storage: IOrchestratorStorage;
	private taskManager: TaskManager;
	private workerCoordinator: WorkerCoordinator;
	private backendEventBridge: BackendEventBridge;
	private eventSubscriptionRegistry: EventSubscriptionRegistry;
	private interventionManager?: InterventionManager;
	private wsServer?: WorkerWebSocketServer;
	private restAPI?: RestAPI;
	private workspaceManager?: WorkspaceManager;
	// private uiInstance?: any;
	private isRunning: boolean = false;

	// UI-related services
	private snapshotService?: StateSnapshotService;
	private metricsCollector?: MetricsCollector;
	private startTime: Date;

	constructor(config?: OrchestratorConfig) {
		this.restPort = config?.restPort || Number(process.env.REST_PORT) || 3737;
		this.wsPort = config?.wsPort || Number(process.env.WS_PORT) || 3738;
		this.projectRoot = config?.projectRoot || process.cwd();
		this.libraryMode = config?.libraryMode ?? false;
		this.stateManager = new StateManager();
		this.storage = config?.storage ?? new FileBasedOrchestratorStorage();
		this.taskManager = new TaskManager(this.stateManager, this.storage);
		this.backendEventBridge = new BackendEventBridge();
		this.eventSubscriptionRegistry = new EventSubscriptionRegistry();
		this.workerCoordinator = new WorkerCoordinator(this.backendEventBridge, this.stateManager);
		this.startTime = new Date();

		// Initialize Logger with StateManager
		// Logger.initialize(this.stateManager);

		log.info(
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
		this.interventionManager = new InterventionManager(this.taskManager, this.storage);
		await this.interventionManager.loadPendingInterventions();
		log.info('Orchestrator', 'InterventionManager initialized');

		// Create WebSocket server -- pass eventSubscriptionRegistry at construction so
		// subscriptions are registered even for workers that connect during startup
		this.wsServer = new WorkerWebSocketServer(
			this.workerCoordinator,
			this.stateManager,
			this.interventionManager,
			this.wsPort,
			this.eventSubscriptionRegistry
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

		// Create REST API only if not in library mode
		// In library mode, the backend (Fastify) handles HTTP/WebSocket communication
		if (!this.libraryMode) {
			this.restAPI = new RestAPI(this.taskManager, this.wsServer, this.restPort, this.workspaceManager);
		} else {
			log.info('Orchestrator', 'REST API disabled (library mode)');
		}
	}

	/**
	 * Start the orchestrator and all services
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			throw new Error('Orchestrator is already running');
		}

		log.info('[Orchestrator] Starting orchestrator...');
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

			log.info('[Orchestrator] Orchestrator started successfully');
			log.info('Orchestrator', 'All services started successfully');
		} catch (error) {
			log.error('Orchestrator', 'Failed to start:', error);
			await this.shutdown();
			throw error;
		}
	}

	/**
	 * Shutdown the orchestrator and all services
	 */
	async shutdown(): Promise<void> {
		if (!this.isRunning) {
			log.info('[Orchestrator] Already shut down, skipping');
			return;
		}

		log.info('[Orchestrator] Shutting down...');

		// Emit orchestrator stopping event
		this.stateManager.emitOrchestratorStopping();

		this.isRunning = false;

		// Stop metrics collector
		this.metricsCollector?.stop();
		log.info('[Orchestrator] MetricsCollector stopped');

		// Cleanup InterventionManager
		this.interventionManager?.cleanup();
		log.info('[Orchestrator] InterventionManager cleaned up');

		// // Unmount UI
		// if (this.uiInstance) {
		// 	this.uiInstance.unmount();
		// }

		// Stop REST API
		await this.restAPI?.stop();
		log.info('[Orchestrator] restAPI Stopped');

		// Stop WebSocket server
		await this.wsServer?.stop();
		log.info('[Orchestrator] wsServer Stopped');

		log.info('[Orchestrator] Stopped');
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
	 * Get the worker coordinator instance
	 */
	getWorkerCoordinator(): WorkerCoordinator {
		return this.workerCoordinator;
	}

	/**
	 * Get the backend event bridge instance
	 */
	getBackendEventBridge(): BackendEventBridge {
		return this.backendEventBridge;
	}

	/**
	 * Get the event subscription registry instance
	 */
	getEventSubscriptionRegistry(): EventSubscriptionRegistry {
		return this.eventSubscriptionRegistry;
	}
}
