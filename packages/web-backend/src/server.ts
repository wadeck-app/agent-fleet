// CRITICAL: Load environment variables BEFORE any other imports
// This ensures env vars are available when other modules initialize
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
// ======================================================================================
// Now import everything else
import Fastify, { type FastifyInstance } from 'fastify';
import { Orchestrator } from 'orchestrator';
import * as os from 'os';
import * as path from 'path';
import { getOrchestratorPortsFromEnv } from 'shared-common/PortCalculator';
import { logger } from 'shared-common/logger';
import { fileURLToPath } from 'url';

import type { DataStoreFactory } from './factories';
import apiStatsHook from './fastify/hooks/apiStats.hook';
import errorHandlerHook from './fastify/hooks/errorHandler.hook';
import latencySimulatorHook from './fastify/hooks/latencySimulator.hook';
import requestLoggerHook from './fastify/hooks/requestLogger.hook';
import responseHelpersPlugin from './fastify/plugins/responseHelpers.plugin';
import routesPlugin from './fastify/plugins/routes.plugin';
import { EventBroadcaster } from './transport/EventBroadcaster';
import { MessageQueue } from './transport/MessageQueue';
import { LongPollingTransportServer } from './transport/adapters/LongPollingTransportServer';
import { SSETransportServer } from './transport/adapters/SSETransportServer';
import { WebSocketTransportServer } from './transport/adapters/WebSocketTransportServer';
import { initializeFactory } from './utils/factory-instance';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load from backend/.env
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

/**
 * Initialize OrchestratorClient based on environment configuration
 */
// async function initializeOrchestratorClient(): Promise<OrchestratorClient> {
async function initializeOrchestratorClient(): Promise<Orchestrator> {
	const mode = process.env.ORCHESTRATOR_MODE || 'library';

	if (mode === 'library') {
		// Library mode: Factory will create and start orchestrator internally
		logger.info('[Orchestrator] Initializing in library mode (embedded)');

		// Use the same port calculation as the worker for consistency
		const { wsPort: calculatedWsPort, restPort: calculatedRestPort } = getOrchestratorPortsFromEnv();

		const orchestratorWsPort = parseInt(process.env.ORCHESTRATOR_WS_PORT || calculatedWsPort.toString(), 10);
		const orchestratorRestPort = parseInt(process.env.ORCHESTRATOR_REST_PORT || calculatedRestPort.toString(), 10);

		logger.info(`[Orchestrator] Calculated ports from env: REST=${calculatedRestPort}, WS=${calculatedWsPort}`);

		const orchestratorConfig = {
			wsPort: orchestratorWsPort,
			// restPort,
			projectRoot: process.cwd(),
			// Always include libraryMode
			libraryMode: true,
		};
		const orchestrator = new Orchestrator(orchestratorConfig);
		await orchestrator.start();

		// // Factory handles orchestrator creation and startup
		// const orchestratorClient = await OrchestratorClientFactory.create({
		// 	mode: 'library',
		// 	wsPort: orchestratorWsPort,
		// 	restPort: orchestratorRestPort,
		// 	libraryMode: true, // Disable REST API when embedded in backend
		// });
		//
		// await orchestratorClient.connect();
		logger.info(`[Orchestrator] Connected (WS: ${orchestratorWsPort}, REST disabled in library mode)`);

		// return orchestratorClient;
		return orchestrator;
	} else {
		throw new Error(`Invalid ORCHESTRATOR_MODE: ${mode}. Must be 'library'.`);
	}
}

/**
 * Initialize Multi-Transport Server (WebSocket, SSE, Long Polling)
 *
 * Anti-fragile design:
 * - Each transport is independent
 * - Failure in one transport doesn't affect others
 * - All transports share same session manager and message queue
 * - EventBroadcaster routes to appropriate transport
 */
async function initializeTransportServer(app: FastifyInstance, factory: DataStoreFactory) {
	// Get session manager and transport router from factory
	const sessionManager = factory.getSessionManager();
	const router = factory.getTransportRouter();

	// Create MessageQueue for polling transports (SSE, Long Polling)
	const messageQueue = new MessageQueue({
		maxQueueSize: 100,
		messageTTL: 60000, // 1 minute
		cleanupInterval: 10000, // 10 seconds
	});

	// Create transport servers
	const wsTransportServer = new WebSocketTransportServer(sessionManager, router);
	const sseTransportServer = new SSETransportServer(sessionManager, messageQueue);
	const longPollingTransportServer = new LongPollingTransportServer(sessionManager, messageQueue);

	// Initialize all transports
	await wsTransportServer.initialize(app);
	await sseTransportServer.initialize(app);
	await longPollingTransportServer.initialize(app);

	// Register WebSocket as primary transport server in factory (for MonitoringController)
	factory.setTransportServer(wsTransportServer);

	// Create EventBroadcaster that broadcasts to ALL transports
	const allTransports = [wsTransportServer, sseTransportServer, longPollingTransportServer];
	const eventBroadcaster = new EventBroadcaster(allTransports, sessionManager, messageQueue);
	factory.setEventBroadcaster(eventBroadcaster);

	logger.info(`[Transport] Multi-transport server initialized:`);
	logger.info(`  - WebSocket: ws://localhost:${PORT}/ws`);
	logger.info(`  - SSE: http://localhost:${PORT}/sse`);
	logger.info(`  - Long Polling: http://localhost:${PORT}/long-polling/events`);

	// Log connection events for all transports
	const logConnection = (transport: string) => (clientId: string) => {
		const type = sessionManager.getTransportType(clientId);
		logger.info(`[${transport}] Client ${clientId} connected (type=${type})`);
	};

	const logDisconnection = (transport: string) => (clientId: string) => {
		logger.info(`[${transport}] Client ${clientId} disconnected`);
	};

	wsTransportServer.onClientConnected(logConnection('WebSocket'));
	wsTransportServer.onClientDisconnected(logDisconnection('WebSocket'));

	sseTransportServer.onClientConnected(logConnection('SSE'));
	sseTransportServer.onClientDisconnected(logDisconnection('SSE'));

	longPollingTransportServer.onClientConnected(logConnection('LongPolling'));
	longPollingTransportServer.onClientDisconnected(logDisconnection('LongPolling'));

	// Log transport distribution every 60 seconds
	setInterval(() => {
		sessionManager.logTransportDistribution();
	}, 60000);
}

// SAFETY: Force in-memory mode when running E2E tests
// This prevents any accidental writes to production database during testing
if (process.env.E2E_MODE === 'true') {
	process.env.USE_PRODUCTION_DB = 'false';
}

// SECURITY: Prevent DISABLE_AUTH_DEV in production
// This is a HARD FAIL to prevent accidental deployment with auth disabled
if (process.env.NODE_ENV === 'production' && process.env.DISABLE_AUTH_DEV === 'true') {
	logger.error('❌ FATAL SECURITY ERROR: DISABLE_AUTH_DEV=true in production environment!');
	logger.error('❌ Authentication bypass is ONLY allowed in development mode.');
	logger.error('❌ Server startup aborted to prevent security breach.');
	process.exit(1);
}

// WARNING: Log if auth is disabled in development (for visibility)
if (process.env.DISABLE_AUTH_DEV === 'true') {
	logger.warn('⚠️  WARNING: Authentication is DISABLED (DISABLE_AUTH_DEV=true)');
	logger.warn('⚠️  This is ONLY safe in development mode!');
	logger.warn('⚠️  All requests will be authenticated as mock user: dev-user-no-auth');
}

/**
 * ===========================================================================================
 * BACKEND SERVER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Architecture:
 * - Controllers (HTTP layer) → Services (business logic) → Repositories (data access) → Storage
 *
 * Benefits:
 * ✅ Separation of concerns (controller / service / repository / storage)
 * ✅ Dependency injection via DataStoreFactory
 * ✅ Perfect type safety with Zod contracts
 * ✅ Lazy controller loading (created only on first request)
 * ✅ Query builder for complex queries (in-memory for tests, SQL for prod)
 * ✅ Easy to test (mock services, mock storage)
 *
 * ===========================================================================================
 */

// ===========================================================================================
// CREATE FASTIFY SERVER
// ===========================================================================================

// const fastify = Fastify({
// 	logger: {
// 		level: 'info',
// 		transport: {
// 			target: 'pino-pretty',
// 			options: {
// 				translateTime: 'HH:MM:ss Z',
// 				ignore: 'pid,hostname',
// 			},
// 		},
// 	},
// });
const fastify = Fastify({
	logger: false,
});

// Calculate ports from PROJECT_ID for parallel development between projects
// PROJECT_ID=0 → Frontend:5000, Backend:3000 | WORKSPACE_ID=1 → Frontend:5010, Backend:3010
const projectId = parseInt(process.env.PROJECT_ID || '0', 10);
// Calculate PORT from WORKSPACE_ID for parallel development
// WORKSPACE_ID=0 → 3000, WORKSPACE_ID=1 → 3100, WORKSPACE_ID=2 → 3200, etc.
const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
const calculatedPort = 3000 + projectId * 10 + workspaceId * 100;
const PORT = parseInt(process.env.PORT || calculatedPort.toString(), 10);

// Helper function to get network addresses
function getNetworkAddresses(): string[] {
	const interfaces = os.networkInterfaces();
	const addresses: string[] = [];

	for (const name of Object.keys(interfaces)) {
		const nets = interfaces[name];
		if (!nets) continue;

		for (const net of nets) {
			// Skip internal and non-IPv4 addresses
			if (net.family === 'IPv4' && !net.internal) {
				// Filter to show only 192.168.x.x addresses
				if (net.address.startsWith('192.168.')) {
					addresses.push(net.address);
				}
			}
		}
	}

	return addresses;
}

// ===========================================================================================
// REGISTER CONTROLLERS WITH DEPENDENCY INJECTION
// ===========================================================================================

// // Register Ingredients controller with injected service
// fastify.register(
// 	registerControllerWithCheck('/api/ingredients', async () => {
// 		const {default: IngredientsController} = await import('./controllers/IngredientsController');
// 		const service = factory.getIngredientsService();
// 		return new IngredientsController(service);
// 	})
// );
//
// // Register Books controller with injected service
// fastify.register(
// 	registerControllerWithCheck('/api/books', async () => {
// 		const {default: BooksController} = await import('./controllers/BooksController');
// 		const service = factory.getBooksService();
// 		return new BooksController(service);
// 	})
// );

// // Health check route
// fastify.get('/health', async () => ({
// 	status: 'ok',
// 	architecture: 'layered (controller → service → repository → storage)',
// 	storage: 'in-memory',
// 	timestamp: new Date().toISOString(),
// }));

// ===========================================================================================
// DASHBOARD BROADCASTER
// ===========================================================================================

/**
 * Start broadcasting dashboard data via WebSocket
 * Reactive/event-driven: broadcasts only when orchestrator state changes
 */
function startDashboardBroadcaster(factory: DataStoreFactory): void {
	const dashboardService = factory.getDashboardService();
	const eventBroadcaster = factory.getEventBroadcaster();
	const orchestratorWrapper = factory.getOrchestratorWrapper();

	const broadcastDashboardData = async () => {
		try {
			if (!eventBroadcaster) {
				logger.warn('[Dashboard Broadcaster] EventBroadcaster not initialized');
				return;
			}

			const dashboardData = await dashboardService.getDashboardData();
			eventBroadcaster.broadcast('b2f:dashboard:updated', dashboardData);
			console.log('[Dashboard Broadcaster] Broadcast dashboard data (reactive)');
		} catch (error) {
			logger.error('[Dashboard Broadcaster] Failed to broadcast dashboard data:', error);
		}
	};

	// Initial broadcast on startup
	broadcastDashboardData();

	// Listen to orchestrator events and broadcast on changes (reactive mode)
	orchestratorWrapper.on('task.created', broadcastDashboardData);
	orchestratorWrapper.on('task.updated', broadcastDashboardData);
	orchestratorWrapper.on('task.status_changed', broadcastDashboardData);
	orchestratorWrapper.on('worker.connected', broadcastDashboardData);
	orchestratorWrapper.on('worker.disconnected', broadcastDashboardData);
	orchestratorWrapper.on('worker.status', broadcastDashboardData);

	logger.info('[Dashboard Broadcaster] Started (reactive/event-driven mode)');
}

/**
 * Start broadcasting tasks data via WebSocket
 * Reactive/event-driven: broadcasts only when task state changes
 */
function startTasksBroadcaster(factory: DataStoreFactory): void {
	const tasksService = factory.getTasksService();
	const eventBroadcaster = factory.getEventBroadcaster();
	const orchestratorWrapper = factory.getOrchestratorWrapper();

	const broadcastTasksData = async () => {
		try {
			if (!eventBroadcaster) {
				logger.warn('[Tasks Broadcaster] EventBroadcaster not initialized');
				return;
			}

			const tasksData = await tasksService.getTasksData({});
			eventBroadcaster.broadcast('b2f:tasks:updated', tasksData);
			console.log('[Tasks Broadcaster] Broadcast tasks data (reactive)');
		} catch (error) {
			logger.error('[Tasks Broadcaster] Failed to broadcast tasks data:', error);
		}
	};

	// Initial broadcast on startup
	broadcastTasksData();

	// Listen to orchestrator events and broadcast on changes (reactive mode)
	orchestratorWrapper.on('task.created', broadcastTasksData);
	orchestratorWrapper.on('task.updated', broadcastTasksData);
	orchestratorWrapper.on('task.status_changed', broadcastTasksData);

	logger.info('[Tasks Broadcaster] Started (reactive/event-driven mode)');
}

/**
 * Start broadcasting workers data via WebSocket
 * Reactive/event-driven: broadcasts only when worker state changes
 */
function startWorkersBroadcaster(factory: DataStoreFactory): void {
	const workersService = factory.getWorkersService();
	const eventBroadcaster = factory.getEventBroadcaster();
	const orchestratorWrapper = factory.getOrchestratorWrapper();

	const broadcastWorkersData = async () => {
		try {
			if (!eventBroadcaster) {
				logger.warn('[Workers Broadcaster] EventBroadcaster not initialized');
				return;
			}

			const workersData = await workersService.getWorkersData();
			eventBroadcaster.broadcast('b2f:workers:updated', workersData);
			console.log('[Workers Broadcaster] Broadcast workers data (reactive)');
		} catch (error) {
			logger.error('[Workers Broadcaster] Failed to broadcast workers data:', error);
		}
	};

	// Initial broadcast on startup
	broadcastWorkersData();

	// Listen to orchestrator events and broadcast on changes (reactive mode)
	orchestratorWrapper.on('worker.connected', broadcastWorkersData);
	orchestratorWrapper.on('worker.disconnected', broadcastWorkersData);
	orchestratorWrapper.on('worker.status', broadcastWorkersData);

	logger.info('[Workers Broadcaster] Started (reactive/event-driven mode)');
}

// ===========================================================================================
// START SERVER
// ===========================================================================================

// Initialize services and start server
async function start() {
	try {
		// Register plugins
		// Configure Helmet security headers based on environment
		// SECURE BY DEFAULT: All security headers enabled unless DEPLOY_ENV=local
		// DEPLOY_ENV=local disables security for HTTP local testing
		// NODE_ENV=production enables static file serving
		const isLocalTesting = process.env.DEPLOY_ENV === 'local';
		const isDevelopment = process.env.NODE_ENV === 'development';

		await fastify.register(helmet, {
			// Content Security Policy (disabled only in dev or local testing)
			contentSecurityPolicy:
				isDevelopment || isLocalTesting
					? false
					: {
							directives: {
								defaultSrc: ["'self'"],
								styleSrc: ["'self'", "'unsafe-inline'"],
								scriptSrc: ["'self'"],
								imgSrc: ["'self'", 'data:', 'https:'],
								connectSrc: ["'self'"],
								fontSrc: ["'self'", 'data:'],
								objectSrc: ["'none'"],
								mediaSrc: ["'self'"],
								frameSrc: ["'none'"],
							},
						},

			// Cross-Origin policies (disabled only in dev or local testing)
			crossOriginOpenerPolicy: isDevelopment || isLocalTesting ? false : { policy: 'same-origin' },
			crossOriginResourcePolicy: isDevelopment || isLocalTesting ? false : { policy: 'same-origin' },
			crossOriginEmbedderPolicy: isDevelopment || isLocalTesting ? false : { policy: 'require-corp' },

			// HSTS (disabled only in dev or local testing)
			hsts:
				isDevelopment || isLocalTesting
					? false
					: {
							maxAge: 31536000,
							includeSubDomains: true,
							preload: true,
						},
		});

		// Register timing/logging hooks BEFORE middleware that might short-circuit (like CORS)
		// This ensures accurate timing for all requests, including OPTIONS
		await fastify.register(requestLoggerHook);
		await fastify.register(apiStatsHook);
		if (process.env.NODE_ENV === 'development') {
			const isE2EMode = process.env.E2E_MODE === 'true';
			// Use environment variables for latency simulation, with sensible defaults
			const minDelay = isE2EMode ? 10 : parseInt(process.env.LATENCY_MIN || '150', 10);
			const maxDelay = isE2EMode ? 50 : parseInt(process.env.LATENCY_MAX || '600', 10);
			await fastify.register(latencySimulatorHook, { minDelay, maxDelay });
			if (!isE2EMode) {
				logger.info(`Latency simulator enabled: ${minDelay}-${maxDelay}ms random delay`);
			}
		}

		// CORS configuration
		// In development, accept all origins to allow access from mobile devices
		// In production, restrict to specific origin from environment variable
		await fastify.register(cors, {
			origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN || 'http://localhost:5173' : true,
			credentials: true,
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
			// Allow custom headers (X-Conn-Id for request correlation and broadcast echo prevention)
			allowedHeaders: ['Content-Type', 'Authorization', 'X-Conn-Id'],
			// Expose custom headers in response (if needed in future)
			exposedHeaders: ['X-Request-Id'],
		});

		// Register cookie plugin for authentication
		// Required for parsing cookies in requests and setting cookies in responses
		await fastify.register(cookie, {
			secret: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-in-production',
			parseOptions: {}, // options for cookie.parse
		});

		await fastify.register(sensible);
		await fastify.register(responseHelpersPlugin);

		// Register error handler hook (after all other hooks)
		await fastify.register(errorHandlerHook);

		// Register routes
		// await fastify.register(routesPlugin, {prefix: '/api'});
		// /api/xxx is used in the url to ease the typing
		await fastify.register(routesPlugin);

		// Serve static files in production only
		if (process.env.NODE_ENV === 'production') {
			await fastify.register(fastifyStatic, {
				root: path.join(__dirname, '../public'),
				prefix: '/',
			});

			// SPA fallback: all non-API routes → index.html
			// This ensures React Router handles client-side routing
			fastify.setNotFoundHandler((request, reply) => {
				// If request is for API route, return 404 JSON
				if (request.url.startsWith('/api')) {
					return reply.code(404).send({ error: 'API endpoint not found' });
				}
				// Otherwise, serve index.html for React Router
				return reply.sendFile('index.html');
			});
		}

		// Health check handler (reused for both endpoints)
		const healthCheckHandler = async (request: any, reply: any) => {
			// Check critical dependencies
			const checks = {
				server: 'ok',
				// TODO: Add database check when integrated
				// database: await checkDatabaseConnection() ? 'ok' : 'error'
			};

			const allOk = Object.values(checks).every(status => status === 'ok');

			return reply.code(allOk ? 200 : 503).send({
				status: allOk ? 'ok' : 'degraded',
				timestamp: new Date().toISOString(),
				uptime: process.uptime(),
				checks,
			});
		};

		// Health check endpoints (used by frontend circuit breaker)
		// /health - for direct backend access (dev, docker, etc.)
		// /api/health - for production when only /api is exposed
		fastify.get('/health', healthCheckHandler);
		fastify.get('/api/health', healthCheckHandler);

		// Initialize OrchestratorClient (library or remote mode)
		const orchestratorClient = await initializeOrchestratorClient();

		// Initialize global factory for dependency injection
		// This must be done BEFORE any controllers are loaded
		const factory = initializeFactory('memory', orchestratorClient);

		if (process.env.USE_PRODUCTION_DB === 'true') {
			//TODO database integration
			// Seed initial data (for development)
			await factory.seedData();

			// Initialize WebSocket transport server
			await initializeTransportServer(fastify, factory);
		} else if (process.env.E2E_MODE !== 'true') {
			//logger.info('Skipping Google Sheets and Gemini AI initialization (in-memory mode)');

			// Seed initial data (for development)
			await factory.seedData();

			// Initialize WebSocket transport server
			await initializeTransportServer(fastify, factory);
		} else {
			// E2E mode also needs a factory for controllers
			// Initialize WebSocket transport server for E2E tests
			await initializeTransportServer(fastify, factory);
		}

		// Start server
		// Listen on 0.0.0.0 to allow connections from other devices on the network
		await fastify.listen({ port: PORT, host: '0.0.0.0' });

		// In E2E mode, emit a minimal success message for global-setup to detect
		// This allows the test setup to know when the backend is ready without doing fetchs
		if (process.env.E2E_MODE === 'true') {
			const readyMessage = `E2E_BACKEND_READY port=${PORT} pid=${process.pid} runId=${process.env.RUN_ID || 'unknown'}`;
			console.log(readyMessage);
			// Force flush stdout to ensure message is immediately sent (important on Windows)
			if (process.stdout.write) {
				process.stdout.write('');
			}
		} else {
			// Normal startup logs for development mode
			logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
			logger.info(`  >  Local:   http://localhost:${PORT}/`);

			const networkAddresses = getNetworkAddresses();
			networkAddresses.forEach(address => {
				logger.info(`  >  Network: http://${address}:${PORT}/`);
			});
		}

		// Start broadcasters (only in normal mode, not E2E)
		if (process.env.E2E_MODE !== 'true') {
			startDashboardBroadcaster(factory);
			startTasksBroadcaster(factory);
			startWorkersBroadcaster(factory);
		}
	} catch (err) {
		// Always log startup errors, even in E2E mode (critical for debugging)
		console.error('❌ FATAL: Failed to start backend server:', err);
		logger.error('Failed to start server', err);
		process.exit(1);
	}
}

// Graceful shutdown
const signals = ['SIGTERM', 'SIGINT'] as const;
signals.forEach(signal => {
	process.on(signal, async () => {
		logger.info(`${signal} signal received: closing HTTP server`);
		await fastify.close();
		process.exit(0);
	});
});

start();
