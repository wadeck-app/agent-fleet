import type { Orchestrator } from 'orchestrator';
import { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { getOrchestratorRestUrl } from 'shared-common/PortCalculator';

// import type { Book } from 'shared-frontend-backend/src/api/books.contract';
// import type { Ingredient } from 'shared-frontend-backend/src/api/ingredients.contract';
import type { Book } from '@app/shared/api/books.contract';
import type { Ingredient } from '@app/shared/api/ingredients.contract';
import type { Intervention } from '@app/shared/api/interventions.contract';
import type { Project } from '@app/shared/api/projects.contract';
import type { Task } from '@app/shared/api/tasks.contract';

import type { AuthService } from '../auth/AuthService';
import { MockAuthService } from '../auth/MockAuthService';
import { BaseRepository } from '../repositories/BaseRepository';
import { BooksRepository } from '../repositories/BooksRepository';
import { IngredientsRepository } from '../repositories/IngredientsRepository';
import { InterventionsRepository } from '../repositories/InterventionsRepository';
import { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import { ProjectsRepository } from '../repositories/ProjectsRepository';
import { TasksRepository } from '../repositories/TasksRepository';
import { type WorkerMetadata, WorkersRepository } from '../repositories/WorkersRepository';
import { WorkspaceMetadataRepository } from '../repositories/WorkspaceMetadataRepository';
import { BooksService } from '../services/BooksService';
import { DashboardService } from '../services/DashboardService';
import { FlowsService } from '../services/FlowsService';
import { IngredientsService } from '../services/IngredientsService';
import { InterventionsService } from '../services/InterventionsService';
import { OrchestratorEventHandler } from '../services/OrchestratorEventHandler';
import { ProjectsService } from '../services/ProjectsService';
import { TasksService } from '../services/TasksService';
import { WorkersService } from '../services/WorkersService';
import { WorkspaceMetadataFile } from '../services/WorkspaceMetadataFile';
import { WorkspacesService } from '../services/WorkspacesService';
import type { DataStorage } from '../storage/DataStorage';
import { FileBasedStorage } from '../storage/FileBasedStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { ITransportServer } from '../transport/ITransportServer';
import { TransportRouter } from '../transport/TransportRouter';
import { TransportSessionManager } from '../transport/TransportSessionManager';

/**
 * ===========================================================================================
 * APPLICATION FACTORY
 * ===========================================================================================
 *
 * Central factory for creating all application dependencies.
 * Implements dependency injection pattern.
 *
 * Flow:
 * 1. Create DataStorage (InMemoryStorage or MariaDBStorage)
 * 2. Create BaseRepositories for each entity
 * 3. Create entity Repositories wrapping BaseRepositories
 * 4. Create Services with Repository dependencies
 * 5. Inject Services into Controllers
 *
 * ===========================================================================================
 */

export class DataStoreFactory {
	// Primary storage for persistent data (projects, workers, etc.)
	private storage: DataStorage;
	// In-memory storage for reference data (ingredients, books) - reloaded at each startup
	private referenceStorage: InMemoryStorage;
	private ingredientsService?: IngredientsService;
	private booksService?: BooksService;
	private dashboardService?: DashboardService;
	private workersService?: WorkersService;
	private flowsService?: FlowsService;
	private tasksService?: TasksService;
	private workspacesService?: WorkspacesService;
	private projectsService?: ProjectsService;
	private interventionsService?: InterventionsService;
	private authService?: AuthService;
	private sessionManager?: TransportSessionManager;
	private transportRouter?: TransportRouter;
	private eventBroadcaster?: EventBroadcaster;
	private transportServer?: ITransportServer;
	private orchestrator: Orchestrator;
	private orchestratorWrapper: OrchestratorWrapper;
	private orchestratorEventBridge?: any; // OrchestratorEventBridge (using any to avoid circular import)
	private orchestratorEventHandler?: OrchestratorEventHandler;

	constructor(storageMode: 'memory' | 'file' | 'mariadb' = 'file', orchestrator: Orchestrator) {
		// Create primary storage based on mode
		if (storageMode === 'memory') {
			this.storage = new InMemoryStorage();
		} else if (storageMode === 'file') {
			// File-based storage in ./data directory
			const dataDir = process.env.DATA_DIR || './data';
			this.storage = new FileBasedStorage(dataDir);
			console.log(`[DataStoreFactory] Using FileBasedStorage with data directory: ${dataDir}`);
		} else {
			// TODO: Implement MariaDBStorage
			throw new Error('MariaDB storage not yet implemented');
		}

		// Always create in-memory storage for reference data (ingredients, books)
		// These are "seed data" that should be present at every startup
		this.referenceStorage = new InMemoryStorage();
		console.log('[DataStoreFactory] Using InMemoryStorage for reference data (ingredients, books)');

		this.orchestrator = orchestrator;
		this.orchestratorWrapper = new OrchestratorWrapper(orchestrator);
	}

	/**
	 * Get OrchestratorWrapper (library mode access)
	 */
	getOrchestratorWrapper(): OrchestratorWrapper {
		return this.orchestratorWrapper;
	}

	/**
	 * Get orchestrator URL from environment or calculate from WORKSPACE_ID/PROJECT_ID
	 */
	private getOrchestratorUrl(): string {
		if (process.env.ORCHESTRATOR_URL) {
			return process.env.ORCHESTRATOR_URL;
		}

		// Fall back to calculating from WORKSPACE_ID and PROJECT_ID
		return getOrchestratorRestUrl('localhost');
	}

	/**
	 * Get or create IngredientsService
	 */
	getIngredientsService(): IngredientsService {
		if (!this.ingredientsService) {
			// Create BaseRepository using referenceStorage (in-memory)
			const baseRepo = new BaseRepository<Ingredient>('ingredients', this.referenceStorage);

			// Create entity Repository
			const repo = new IngredientsRepository(baseRepo);

			// Create Service
			this.ingredientsService = new IngredientsService(repo);
		}

		return this.ingredientsService;
	}

	/**
	 * Get or create BooksService
	 */
	getBooksService(): BooksService {
		if (!this.booksService) {
			// Create BaseRepository using referenceStorage (in-memory)
			const baseRepo = new BaseRepository<Book>('books', this.referenceStorage);

			// Create entity Repository
			const repo = new BooksRepository(baseRepo);

			// Create Service
			this.booksService = new BooksService(repo);
		}

		return this.booksService;
	}

	/**
	 * Get or create DashboardService
	 */
	getDashboardService(): DashboardService {
		if (!this.dashboardService) {
			// Use orchestratorWrapper directly (library mode - no HTTP calls)
			const orchestratorRepo = new OrchestratorRepository(this.orchestratorWrapper);

			// Create DashboardService
			this.dashboardService = new DashboardService(orchestratorRepo);
		}

		return this.dashboardService;
	}

	/**
	 * Get or create WorkersService
	 */
	getWorkersService(): WorkersService {
		if (!this.workersService) {
			// Get EventBroadcaster
			const eventBroadcaster = this.getEventBroadcaster();

			// Create WorkersRepository
			const workersBaseRepo = new BaseRepository<WorkerMetadata>('workers', this.storage);
			const workersRepository = new WorkersRepository(workersBaseRepo);

			// Create WorkersService with OrchestratorClient (already connected)
			this.workersService = new WorkersService(this.orchestratorWrapper, eventBroadcaster, workersRepository);
		}

		return this.workersService;
	}

	/**
	 * Get or create FlowsService
	 */
	getFlowsService(): FlowsService {
		if (!this.flowsService) {
			// Get EventBroadcaster
			const eventBroadcaster = this.getEventBroadcaster();

			// Create FlowsService with OrchestratorWrapper
			this.flowsService = new FlowsService(this.orchestratorWrapper, eventBroadcaster);
		}

		return this.flowsService;
	}

	/**
	 * Get or create TasksService
	 */
	getTasksService(): TasksService {
		if (!this.tasksService) {
			// Create TasksRepository using persistent storage
			const tasksBaseRepo = new BaseRepository<Task>('tasks', this.storage);
			const tasksRepo = new TasksRepository(tasksBaseRepo);

			// Get EventBroadcaster
			const eventBroadcaster = this.getEventBroadcaster();

			// Get OrchestratorRepository for task enqueueing
			const orchestratorRepo = new OrchestratorRepository(this.orchestratorWrapper);

			// Create TasksService with TasksRepository and OrchestratorRepository
			this.tasksService = new TasksService(tasksRepo, eventBroadcaster, orchestratorRepo);
		}

		return this.tasksService;
	}

	/**
	 * Get or create WorkspacesService
	 */
	getWorkspacesService(): WorkspacesService {
		if (!this.workspacesService) {
			// Create WorkspaceMetadataFile service
			const metadataFile = new WorkspaceMetadataFile();
			const metadataRepo = new WorkspaceMetadataRepository(metadataFile);

			// Create ProjectsRepository
			const projectsBaseRepo = new BaseRepository<Project>('projects', this.storage);
			const projectsRepo = new ProjectsRepository(projectsBaseRepo);

			// Get EventBroadcaster
			const eventBroadcaster = this.getEventBroadcaster();

			// Create WorkspacesService with OrchestratorWrapper directly
			this.workspacesService = new WorkspacesService(
				eventBroadcaster,
				this.orchestratorWrapper,
				metadataRepo,
				projectsRepo
			);
		}

		return this.workspacesService;
	}

	/**
	 * Get or create InterventionsService
	 */
	getInterventionsService(): InterventionsService {
		if (!this.interventionsService) {
			// Create InterventionsRepository using persistent storage (file-based)
			const interventionsBaseRepo = new BaseRepository<Intervention>('interventions', this.storage);
			const interventionsRepo = new InterventionsRepository(interventionsBaseRepo);

			// Get EventBroadcaster
			const eventBroadcaster = this.getEventBroadcaster();

			// Create OrchestratorRepository for cache synchronization
			const orchestratorRepo = new OrchestratorRepository(this.orchestratorWrapper);

			// Create InterventionsService with InterventionsRepository
			// Interventions are persisted to file for durability across restarts
			// OrchestratorRepository used to sync cache when interventions are updated
			this.interventionsService = new InterventionsService(interventionsRepo, eventBroadcaster, orchestratorRepo);
		}

		return this.interventionsService;
	}

	/**
	 * Get or create ProjectsService
	 */
	getProjectsService(): ProjectsService {
		if (!this.projectsService) {
			// Create BaseRepository
			const baseRepo = new BaseRepository<Project>('projects', this.storage);

			// Create ProjectsRepository
			const projectsRepo = new ProjectsRepository(baseRepo);

			// Create OrchestratorRepository for task data
			const orchestratorRepo = new OrchestratorRepository(this.orchestratorWrapper);

			// Create WorkspaceMetadataFile service for workspace cleanup
			const metadataFile = new WorkspaceMetadataFile();
			const workspaceMetadataRepo = new WorkspaceMetadataRepository(metadataFile);

			// Get EventBroadcaster
			const eventBroadcaster = this.getEventBroadcaster();

			// Create ProjectsService with dependencies
			this.projectsService = new ProjectsService(
				projectsRepo,
				orchestratorRepo,
				eventBroadcaster,
				workspaceMetadataRepo,
				this.orchestratorWrapper
			);
		}

		return this.projectsService;
	}

	/**
	 * Get or create AuthService
	 */
	getAuthService(): AuthService {
		if (!this.authService) {
			// Create MockAuthService with JWT secret from env
			const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
			this.authService = new MockAuthService(jwtSecret);
		}

		return this.authService;
	}

	/**
	 * Get or create TransportSessionManager
	 */
	getSessionManager(): TransportSessionManager {
		if (!this.sessionManager) {
			// SessionManager depends on AuthService
			const authService = this.getAuthService();
			this.sessionManager = new TransportSessionManager(authService);
		}

		return this.sessionManager;
	}

	/**
	 * Get or create TransportRouter
	 */
	getTransportRouter(): TransportRouter {
		if (!this.transportRouter) {
			this.transportRouter = new TransportRouter(this);
		}

		return this.transportRouter;
	}

	/**
	 * Get or create EventBroadcaster
	 * Note: Requires ITransportServer to be set after WebSocketTransportServer is created
	 */
	getEventBroadcaster(): EventBroadcaster {
		if (!this.eventBroadcaster) {
			throw new Error(
				'EventBroadcaster not initialized. Call setEventBroadcaster() after creating WebSocketTransportServer.'
			);
		}

		return this.eventBroadcaster;
	}

	/**
	 * Set EventBroadcaster (called after WebSocketTransportServer is created)
	 */
	setEventBroadcaster(broadcaster: EventBroadcaster): void {
		this.eventBroadcaster = broadcaster;
	}

	/**
	 * Set TransportServer (called after WebSocketTransportServer is created)
	 */
	setTransportServer(server: ITransportServer): void {
		this.transportServer = server;
	}

	/**
	 * Get TransportServer
	 */
	getTransportServer(): ITransportServer {
		if (!this.transportServer) {
			throw new Error(
				'TransportServer not initialized. Call setTransportServer() after creating WebSocketTransportServer.'
			);
		}

		return this.transportServer;
	}

	/**
	 * Set OrchestratorEventBridge (called after bridge is created)
	 */
	setOrchestratorEventBridge(bridge: any): void {
		this.orchestratorEventBridge = bridge;
	}

	/**
	 * Get OrchestratorEventBridge (for cleanup on shutdown)
	 */
	getOrchestratorEventBridge(): any | undefined {
		return this.orchestratorEventBridge;
	}

	/**
	 * Get or create OrchestratorEventHandler
	 */
	getOrchestratorEventHandler(): OrchestratorEventHandler {
		if (!this.orchestratorEventHandler) {
			// Get dependencies
			const tasksService = this.getTasksService();
			const interventionsService = this.getInterventionsService();
			const workersService = this.getWorkersService();
			const eventBroadcaster = this.getEventBroadcaster();

			// Create handler
			this.orchestratorEventHandler = new OrchestratorEventHandler(
				tasksService,
				interventionsService,
				workersService,
				eventBroadcaster
			);
		}

		return this.orchestratorEventHandler;
	}

	/**
	 * Initialize orchestrator integration
	 * Call this after orchestrator is started
	 */
	initializeOrchestratorIntegration(): void {
		const backendEventBridge = this.orchestrator.getBackendEventBridge();
		const handler = this.getOrchestratorEventHandler();

		backendEventBridge.registerHandler(async (event: string, data: unknown) => {
			await handler.handleOrchestratorEvent(event, data);
		});

		console.log('[DataStoreFactory] Orchestrator integration initialized');
	}

	/**
	 * Get controller methods for lazy loading
	 */
	async getAuthController() {
		const { default: AuthController } = await import('../controllers/AuthController');
		const authService = this.getAuthService();
		const sessionManager = this.getSessionManager();
		return new AuthController(authService, sessionManager);
	}

	async getTasksController() {
		const { default: TasksController } = await import('../controllers/TasksController');
		const service = this.getTasksService();
		return new TasksController(service);
	}

	async getWorkersController() {
		const { default: WorkersController } = await import('../controllers/WorkersController');
		const service = this.getWorkersService();
		return new WorkersController(service);
	}

	async getFlowsController() {
		const { default: FlowsController } = await import('../controllers/FlowsController');
		const service = this.getFlowsService();
		return new FlowsController(service);
	}

	async getWorkspacesController() {
		const { default: WorkspacesController } = await import('../controllers/WorkspacesController');
		const service = this.getWorkspacesService();
		return new WorkspacesController(service);
	}

	async getInterventionsController() {
		const { default: InterventionsController } = await import('../controllers/InterventionsController');
		const service = this.getInterventionsService();
		return new InterventionsController(service);
	}

	async getProjectsController() {
		const { default: ProjectsController } = await import('../controllers/ProjectsController');
		const service = this.getProjectsService();
		return new ProjectsController(service);
	}

	async getDashboardController() {
		const { default: DashboardController } = await import('../controllers/DashboardController');
		const service = this.getDashboardService();
		return new DashboardController(service);
	}

	async getIngredientsController() {
		const { default: IngredientsController } = await import('../controllers/IngredientsController');
		const service = this.getIngredientsService();
		return new IngredientsController(service);
	}

	async getBooksController() {
		const { default: BooksController } = await import('../controllers/BooksController');
		const service = this.getBooksService();
		return new BooksController(service);
	}

	async getMonitoringController() {
		const { default: MonitoringController } = await import('../controllers/MonitoringController');
		const transportServer = this.getTransportServer();
		const sessionManager = this.getSessionManager();
		return new MonitoringController(transportServer, sessionManager);
	}

	/**
	 * Get the underlying storage (useful for testing - seed data, clear, etc.)
	 */
	getStorage(): DataStorage {
		return this.storage;
	}

	// /**
	//  * Get the orchestrator client
	//  */
	// getOrchestratorClient(): OrchestratorClient {
	// 	return this.orchestratorClient;
	// }

	/**
	 * Seed initial data (useful for development/testing)
	 */
	async seedData(): Promise<void> {
		// Always seed reference data (ingredients and books) into referenceStorage
		// This ensures they are available at every server startup

		// Seed ingredients
		await this.referenceStorage.seed<Ingredient>('ingredients', [
			{
				id: '1',
				name: 'Apple',
				calories: 95,
				protein: 0.5,
				carbs: 25,
				fat: 0.3,
				servingSize: 100,
				unit: 'g',
				category: 'Fruits',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '2',
				name: 'Grilled Chicken',
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				unit: 'g',
				category: 'Meat',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '3',
				name: 'Banana',
				calories: 105,
				protein: 1.3,
				carbs: 27,
				fat: 0.4,
				servingSize: 100,
				unit: 'g',
				category: 'Fruits',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '4',
				name: 'Brown Rice',
				calories: 112,
				protein: 2.6,
				carbs: 24,
				fat: 0.9,
				servingSize: 100,
				unit: 'g',
				category: 'Grains',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '5',
				name: 'Broccoli',
				calories: 34,
				protein: 2.8,
				carbs: 7,
				fat: 0.4,
				servingSize: 100,
				unit: 'g',
				category: 'Vegetables',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '6',
				name: 'Salmon',
				calories: 206,
				protein: 22,
				carbs: 0,
				fat: 13,
				servingSize: 100,
				unit: 'g',
				category: 'Fish',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '7',
				name: 'Greek Yogurt',
				calories: 59,
				protein: 10,
				carbs: 3.6,
				fat: 0.4,
				servingSize: 100,
				unit: 'g',
				category: 'Dairy',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '8',
				name: 'Almonds',
				calories: 579,
				protein: 21,
				carbs: 22,
				fat: 50,
				servingSize: 100,
				unit: 'g',
				category: 'Nuts',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '9',
				name: 'Sweet Potato',
				calories: 86,
				protein: 1.6,
				carbs: 20,
				fat: 0.1,
				servingSize: 100,
				unit: 'g',
				category: 'Vegetables',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '10',
				name: 'Eggs',
				calories: 155,
				protein: 13,
				carbs: 1.1,
				fat: 11,
				servingSize: 100,
				unit: 'g',
				category: 'Dairy',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '11',
				name: 'Spinach',
				calories: 23,
				protein: 2.9,
				carbs: 3.6,
				fat: 0.4,
				servingSize: 100,
				unit: 'g',
				category: 'Vegetables',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '12',
				name: 'Quinoa',
				calories: 120,
				protein: 4.4,
				carbs: 21,
				fat: 1.9,
				servingSize: 100,
				unit: 'g',
				category: 'Grains',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '13',
				name: 'Oats',
				calories: 389,
				protein: 17,
				carbs: 66,
				fat: 7,
				servingSize: 100,
				unit: 'g',
				category: 'Grains',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '14',
				name: 'Blueberries',
				calories: 57,
				protein: 0.7,
				carbs: 14,
				fat: 0.3,
				servingSize: 100,
				unit: 'g',
				category: 'Fruits',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '15',
				name: 'Avocado',
				calories: 160,
				protein: 2,
				carbs: 9,
				fat: 15,
				servingSize: 100,
				unit: 'g',
				category: 'Fruits',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '16',
				name: 'Chicken Breast',
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				unit: 'g',
				category: 'Meat',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '17',
				name: 'Tuna',
				calories: 132,
				protein: 28,
				carbs: 0,
				fat: 1.3,
				servingSize: 100,
				unit: 'g',
				category: 'Fish',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '18',
				name: 'Lentils',
				calories: 116,
				protein: 9,
				carbs: 20,
				fat: 0.4,
				servingSize: 100,
				unit: 'g',
				category: 'Legumes',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '19',
				name: 'Chickpeas',
				calories: 164,
				protein: 8.9,
				carbs: 27,
				fat: 2.6,
				servingSize: 100,
				unit: 'g',
				category: 'Legumes',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '20',
				name: 'Beef Sirloin',
				calories: 271,
				protein: 25,
				carbs: 0,
				fat: 18,
				servingSize: 100,
				unit: 'g',
				category: 'Meat',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '21',
				name: 'Peanut Butter',
				calories: 588,
				protein: 25,
				carbs: 20,
				fat: 50,
				servingSize: 100,
				unit: 'g',
				category: 'Nuts',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '22',
				name: 'Cottage Cheese',
				calories: 98,
				protein: 11,
				carbs: 3.4,
				fat: 4.3,
				servingSize: 100,
				unit: 'g',
				category: 'Dairy',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '23',
				name: 'Carrots',
				calories: 41,
				protein: 0.9,
				carbs: 10,
				fat: 0.2,
				servingSize: 100,
				unit: 'g',
				category: 'Vegetables',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '24',
				name: 'Whole Wheat Bread',
				calories: 247,
				protein: 13,
				carbs: 41,
				fat: 3.4,
				servingSize: 100,
				unit: 'g',
				category: 'Grains',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '25',
				name: 'Strawberries',
				calories: 32,
				protein: 0.7,
				carbs: 8,
				fat: 0.3,
				servingSize: 100,
				unit: 'g',
				category: 'Fruits',
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		]);

		// Seed books
		await this.referenceStorage.seed<Book>('books', [
			{
				id: '1',
				title: 'The Pragmatic Programmer',
				author: 'Andrew Hunt',
				isbn: '978-0135957059',
				publishedYear: 2019,
				genre: 'Programming',
				pages: 352,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '2',
				title: 'Clean Code',
				author: 'Robert C. Martin',
				isbn: '978-0132350884',
				publishedYear: 2008,
				genre: 'Programming',
				pages: 464,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '3',
				title: '1984',
				author: 'George Orwell',
				isbn: '978-0451524935',
				publishedYear: 1949,
				genre: 'Fiction',
				pages: 328,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '4',
				title: 'To Kill a Mockingbird',
				author: 'Harper Lee',
				isbn: '978-0061120084',
				publishedYear: 1960,
				genre: 'Fiction',
				pages: 324,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '5',
				title: 'The Great Gatsby',
				author: 'F. Scott Fitzgerald',
				isbn: '978-0743273565',
				publishedYear: 1925,
				genre: 'Fiction',
				pages: 180,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '6',
				title: 'Design Patterns',
				author: 'Erich Gamma',
				isbn: '978-0201633610',
				publishedYear: 1994,
				genre: 'Programming',
				pages: 395,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '7',
				title: 'The Catcher in the Rye',
				author: 'J.D. Salinger',
				isbn: '978-0316769174',
				publishedYear: 1951,
				genre: 'Fiction',
				pages: 277,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '8',
				title: 'Pride and Prejudice',
				author: 'Jane Austen',
				isbn: '978-0141439518',
				publishedYear: 1813,
				genre: 'Romance',
				pages: 432,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '9',
				title: 'The Hobbit',
				author: 'J.R.R. Tolkien',
				isbn: '978-0547928227',
				publishedYear: 1937,
				genre: 'Fantasy',
				pages: 310,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '10',
				title: "Harry Potter and the Sorcerer's Stone",
				author: 'J.K. Rowling',
				isbn: '978-0590353427',
				publishedYear: 1997,
				genre: 'Fantasy',
				pages: 309,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '11',
				title: 'The Lord of the Rings',
				author: 'J.R.R. Tolkien',
				isbn: '978-0544003415',
				publishedYear: 1954,
				genre: 'Fantasy',
				pages: 1178,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '12',
				title: 'Refactoring',
				author: 'Martin Fowler',
				isbn: '978-0134757599',
				publishedYear: 2018,
				genre: 'Programming',
				pages: 448,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '13',
				title: 'The Martian',
				author: 'Andy Weir',
				isbn: '978-0553418026',
				publishedYear: 2011,
				genre: 'Science Fiction',
				pages: 369,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '14',
				title: 'Dune',
				author: 'Frank Herbert',
				isbn: '978-0441172719',
				publishedYear: 1965,
				genre: 'Science Fiction',
				pages: 688,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '15',
				title: 'Foundation',
				author: 'Isaac Asimov',
				isbn: '978-0553293357',
				publishedYear: 1951,
				genre: 'Science Fiction',
				pages: 255,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '16',
				title: 'Brave New World',
				author: 'Aldous Huxley',
				isbn: '978-0060850524',
				publishedYear: 1932,
				genre: 'Science Fiction',
				pages: 288,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '17',
				title: 'The Shining',
				author: 'Stephen King',
				isbn: '978-0307743657',
				publishedYear: 1977,
				genre: 'Horror',
				pages: 447,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '18',
				title: 'It',
				author: 'Stephen King',
				isbn: '978-1501142970',
				publishedYear: 1986,
				genre: 'Horror',
				pages: 1138,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '19',
				title: 'The Alchemist',
				author: 'Paulo Coelho',
				isbn: '978-0062315007',
				publishedYear: 1988,
				genre: 'Fiction',
				pages: 208,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '20',
				title: 'Sapiens',
				author: 'Yuval Noah Harari',
				isbn: '978-0062316097',
				publishedYear: 2011,
				genre: 'Non-Fiction',
				pages: 443,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '21',
				title: 'Educated',
				author: 'Tara Westover',
				isbn: '978-0399590504',
				publishedYear: 2018,
				genre: 'Non-Fiction',
				pages: 334,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '22',
				title: 'Becoming',
				author: 'Michelle Obama',
				isbn: '978-1524763138',
				publishedYear: 2018,
				genre: 'Biography',
				pages: 448,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '23',
				title: 'Steve Jobs',
				author: 'Walter Isaacson',
				isbn: '978-1451648539',
				publishedYear: 2011,
				genre: 'Biography',
				pages: 656,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '24',
				title: 'Atomic Habits',
				author: 'James Clear',
				isbn: '978-0735211292',
				publishedYear: 2018,
				genre: 'Self-Help',
				pages: 320,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '25',
				title: 'The 7 Habits of Highly Effective People',
				author: 'Stephen Covey',
				isbn: '978-1982137274',
				publishedYear: 1989,
				genre: 'Self-Help',
				pages: 381,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '26',
				title: 'Thinking, Fast and Slow',
				author: 'Daniel Kahneman',
				isbn: '978-0374533557',
				publishedYear: 2011,
				genre: 'Psychology',
				pages: 499,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '27',
				title: 'The Power of Habit',
				author: 'Charles Duhigg',
				isbn: '978-0812981605',
				publishedYear: 2012,
				genre: 'Psychology',
				pages: 371,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '28',
				title: "You Don't Know JS",
				author: 'Kyle Simpson',
				publishedYear: 2014,
				genre: 'Programming',
				pages: 278,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '29',
				title: 'Eloquent JavaScript',
				author: 'Marijn Haverbeke',
				isbn: '978-1593279509',
				publishedYear: 2018,
				genre: 'Programming',
				pages: 472,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '30',
				title: 'JavaScript: The Good Parts',
				author: 'Douglas Crockford',
				isbn: '978-0596517748',
				publishedYear: 2008,
				genre: 'Programming',
				pages: 176,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '31',
				title: 'The DevOps Handbook',
				author: 'Gene Kim',
				isbn: '978-1942788003',
				publishedYear: 2016,
				genre: 'Programming',
				pages: 480,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '32',
				title: 'Site Reliability Engineering',
				author: 'Betsy Beyer',
				isbn: '978-1491929124',
				publishedYear: 2016,
				genre: 'Programming',
				pages: 550,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '33',
				title: 'The Phoenix Project',
				author: 'Gene Kim',
				isbn: '978-0988262508',
				publishedYear: 2013,
				genre: 'Business',
				pages: 345,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '34',
				title: 'Zero to One',
				author: 'Peter Thiel',
				isbn: '978-0804139298',
				publishedYear: 2014,
				genre: 'Business',
				pages: 224,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: '35',
				title: 'The Lean Startup',
				author: 'Eric Ries',
				isbn: '978-0307887894',
				publishedYear: 2011,
				genre: 'Business',
				pages: 336,
				version: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		]);

		//console.log('[FACTORY] Seeded reference data (ingredients, books)');
	}
}
