# Plan: Transport Abstraction Layer (Frontend ↔ Backend)

## Vue d'ensemble

Conception d'un système de transport agnostique entre Frontend et Backend permettant:

- Communication bidirectionnelle (F2B: requêtes, B2F: événements)
- Support de multiples transports: WebSocket, REST (SSE + Long Polling), Mock
- Fallback automatique WS → SSE → Long Polling
- Mode debug avec switch facile
- Fortement typé via shared-frontend-backend
- Controllers backend réutilisés quel que soit le transport

**Décisions de conception confirmées:**

- ✅ **Scope**: Frontend ↔ Backend uniquement (pas B↔O ni O↔W pour l'instant)
- ✅ **Remplacement**: Supprimer `useOrchestratorWebSocket` - Frontend parle UNIQUEMENT au Backend
- ✅ **Fallback B→F**: SSE (priorité) → Long Polling (si SSE indispo) → Short Polling (dernier recours)
- ✅ **Événements B→F**: Task updates, Worker status, System alerts, Metrics updates

**Architecture cible:**

```
Frontend <═══> Backend <───> Orchestrator <───> Workers
         (New)        (HTTP)           (WS)
```

Frontend ne communique JAMAIS directement avec Orchestrator ou Workers.

## Architecture Proposée

### 1. **Protocole de Communication Unifié**

#### Format de Requête (F2B et WS)

```typescript
interface TransportRequest {
	requestId: string; // UUID pour corréler la réponse
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	url: string; // Ex: '/api/tasks/'
	params?: Record<string, string>; // URL params (:id)
	query?: Record<string, any>; // Query string (?status=pending)
	body?: any; // POST/PUT body
	headers?: Record<string, string>; // Custom headers
}
```

#### Format de Réponse

```typescript
interface TransportResponse<T = any> {
	requestId: string; // Corrélation avec la requête
	status: number; // HTTP status code
	data: T; // Response body
	error?: {
		message: string;
		details?: any;
	};
}
```

#### Format d'Événement (B2F)

```typescript
interface TransportEvent<T = any> {
	type: string; // Ex: 'task_updated', 'worker_connected'
	data: T;
	timestamp: string;
}
```

### 2. **Abstraction Frontend**

#### Interface du Client de Transport

```typescript
// packages/web-frontend/src/framework/transport/ITransportClient.ts
export interface ITransportClient {
	// Lifecycle
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	isConnected(): boolean;

	// F2B: Requêtes
	request<T>(req: TransportRequest): Promise<TransportResponse<T>>;

	// B2F: Événements
	on<T>(eventType: string, handler: (data: T) => void): () => void;
	off(eventType: string, handler?: Function): void;

	// Debug/monitoring
	getStats(): TransportStats;
}

interface TransportStats {
	type: 'websocket' | 'http' | 'mock';
	connected: boolean;
	requestCount: number;
	errorCount: number;
	avgLatency: number;
}
```

#### Implémentations Concrètes

**A. HTTP Transport (avec SSE et Long Polling)**

```typescript
// packages/web-frontend/src/framework/transport/HttpTransportClient.ts
export class HttpTransportClient implements ITransportClient {
	private eventSource: EventSource | null = null;
	private eventHandlers = new Map<string, Set<Function>>();
	private longPollingAbortController: AbortController | null = null;

	constructor(
		private baseUrl: string,
		private eventConfig: {
			mode: 'sse' | 'long-polling' | 'polling';
			sseEndpoint?: string; // Ex: '/api/events/stream'
			pollingEndpoint?: string; // Ex: '/api/events'
			pollingInterval?: number; // Pour short polling
			longPollingTimeout?: number; // Pour long polling (30s)
		}
	) {}

	async connect(): Promise<void> {
		if (this.eventConfig.mode === 'sse') {
			this.setupSSE();
		} else if (this.eventConfig.mode === 'long-polling') {
			this.setupLongPolling();
		} else {
			this.setupShortPolling();
		}
	}

	private setupSSE() {
		try {
			this.eventSource = new EventSource(`${this.baseUrl}${this.eventConfig.sseEndpoint}`);

			this.eventSource.onmessage = event => {
				const transportEvent = JSON.parse(event.data) as TransportEvent;
				const handlers = this.eventHandlers.get(transportEvent.type);
				handlers?.forEach(handler => handler(transportEvent.data));
			};

			this.eventSource.onerror = () => {
				console.warn('SSE connection failed, falling back to long polling');
				this.eventSource?.close();
				this.eventConfig.mode = 'long-polling';
				this.setupLongPolling();
			};
		} catch (error) {
			console.warn('SSE not supported, using long polling');
			this.eventConfig.mode = 'long-polling';
			this.setupLongPolling();
		}
	}

	private async setupLongPolling() {
		const poll = async () => {
			try {
				this.longPollingAbortController = new AbortController();

				const response = await fetch(`${this.baseUrl}${this.eventConfig.pollingEndpoint}`, {
					signal: this.longPollingAbortController.signal,
					// Timeout on server side (30s)
				});

				if (response.ok) {
					const events = (await response.json()) as TransportEvent[];
					events.forEach(event => {
						const handlers = this.eventHandlers.get(event.type);
						handlers?.forEach(handler => handler(event.data));
					});
				}

				// Immediate next poll
				if (this.longPollingAbortController && !this.longPollingAbortController.signal.aborted) {
					poll();
				}
			} catch (error) {
				if (error.name !== 'AbortError') {
					console.warn('Long polling error, waiting before retry', error);
					setTimeout(poll, 5000);
				}
			}
		};

		poll();
	}

	private setupShortPolling() {
		const interval = setInterval(async () => {
			try {
				const response = await fetch(`${this.baseUrl}${this.eventConfig.pollingEndpoint}`);
				const events = (await response.json()) as TransportEvent[];

				events.forEach(event => {
					const handlers = this.eventHandlers.get(event.type);
					handlers?.forEach(handler => handler(event.data));
				});
			} catch (error) {
				console.error('Polling error', error);
			}
		}, this.eventConfig.pollingInterval || 5000);

		// Store interval ID for cleanup
		(this as any)._pollingInterval = interval;
	}

	async request<T>(req: TransportRequest): Promise<TransportResponse<T>> {
		const url = this.buildUrl(req);

		const response = await circuitBreakerService.executeFetch(url, {
			method: req.method,
			headers: req.headers,
			body: req.body ? JSON.stringify(req.body) : undefined,
		});

		return {
			requestId: req.requestId,
			status: response.status,
			data: await response.json(),
		};
	}

	on<T>(eventType: string, handler: (data: T) => void): () => void {
		if (!this.eventHandlers.has(eventType)) {
			this.eventHandlers.set(eventType, new Set());
		}
		this.eventHandlers.get(eventType)!.add(handler);

		return () => {
			const handlers = this.eventHandlers.get(eventType);
			handlers?.delete(handler);
			if (handlers?.size === 0) {
				this.eventHandlers.delete(eventType);
			}
		};
	}

	disconnect(): Promise<void> {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		if (this.longPollingAbortController) {
			this.longPollingAbortController.abort();
			this.longPollingAbortController = null;
		}
		if ((this as any)._pollingInterval) {
			clearInterval((this as any)._pollingInterval);
		}
		return Promise.resolve();
	}
}
```

**B. WebSocket Transport**

```typescript
// packages/web-frontend/src/framework/transport/WebSocketTransportClient.ts
export class WebSocketTransportClient implements ITransportClient {
	private ws: WebSocket | null = null;
	private pendingRequests = new Map<string, PendingRequest>();
	private eventHandlers = new Map<string, Set<Function>>();

	constructor(
		private url: string,
		private reconnectConfig: {
			enabled: boolean;
			maxRetries: number;
			backoff: number[];
		}
	) {}

	async request<T>(req: TransportRequest): Promise<TransportResponse<T>> {
		if (!this.isConnected()) {
			throw new Error('WebSocket not connected');
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(req.requestId);
				reject(new Error('Request timeout'));
			}, 30000);

			this.pendingRequests.set(req.requestId, { resolve, reject, timeout });
			this.ws!.send(JSON.stringify({ type: 'request', ...req }));
		});
	}

	private handleMessage(event: MessageEvent) {
		const message = JSON.parse(event.data);

		if (message.type === 'response') {
			// Réponse à une requête
			const pending = this.pendingRequests.get(message.requestId);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pendingRequests.delete(message.requestId);
				pending.resolve(message);
			}
		} else if (message.type === 'event') {
			// Événement B2F
			const handlers = this.eventHandlers.get(message.eventType);
			handlers?.forEach(handler => handler(message.data));
		}
	}
}
```

**C. Mock Transport (Tests)**

```typescript
// packages/web-frontend/src/framework/transport/MockTransportClient.ts
export class MockTransportClient implements ITransportClient {
	private connected = true;
	private requestLog: TransportRequest[] = [];
	private mockResponses = new Map<string, any>();
	private eventQueue: TransportEvent[] = [];

	constructor(
		private config: {
			latency: number; // Simulated latency (ms)
			errorRate: number; // 0-1, probability of error
			disconnectAfter?: number; // Auto-disconnect after N requests
		}
	) {}

	// Configuration des mocks
	mockResponse(pattern: { method: string; url: RegExp }, response: any) {
		this.mockResponses.set(`${pattern.method}:${pattern.url}`, response);
	}

	simulateEvent<T>(eventType: string, data: T) {
		this.eventQueue.push({ type: eventType, data, timestamp: new Date().toISOString() });
	}

	simulateDisconnect() {
		this.connected = false;
	}

	async request<T>(req: TransportRequest): Promise<TransportResponse<T>> {
		this.requestLog.push(req);

		// Simulate latency
		await new Promise(resolve => setTimeout(resolve, this.config.latency));

		// Simulate error
		if (Math.random() < this.config.errorRate) {
			throw new Error('Simulated network error');
		}

		// Find mock response
		const key = `${req.method}:${req.url}`;
		const mockData = this.mockResponses.get(key) || { data: null };

		return {
			requestId: req.requestId,
			status: 200,
			data: mockData,
		};
	}

	// Accessors pour les tests
	getRequestLog(): TransportRequest[] {
		return [...this.requestLog];
	}
}
```

#### Factory de Transport

```typescript
// packages/web-frontend/src/framework/transport/TransportFactory.ts
export type TransportType = 'websocket' | 'http' | 'mock';

export interface TransportConfig {
	type: TransportType;
	fallback?: 'http'; // Fallback si WS échoue

	http?: {
		baseUrl: string;
		polling?: { enabled: boolean; interval: number };
	};

	websocket?: {
		url: string;
		reconnect?: boolean;
	};

	mock?: {
		latency: number;
		errorRate: number;
	};
}

export class TransportFactory {
	static create(config: TransportConfig): ITransportClient {
		switch (config.type) {
			case 'http':
				return new HttpTransportClient(config.http!.baseUrl, config.http?.polling);

			case 'websocket':
				return new WebSocketTransportClient(config.websocket!.url, {
					enabled: true,
					maxRetries: 5,
					backoff: [1000, 2000, 5000],
				});

			case 'mock':
				return new MockTransportClient(config.mock!);
		}
	}

	// Auto-fallback wrapper
	static createWithFallback(config: TransportConfig): ITransportClient {
		const primary = this.create(config);

		if (config.fallback === 'http' && config.type === 'websocket') {
			return new FallbackTransportClient(primary, new HttpTransportClient(config.http!.baseUrl));
		}

		return primary;
	}
}
```

### 3. **Abstraction Backend**

#### Interface du Serveur de Transport

```typescript
// packages/web-backend/src/transport/ITransportServer.ts
export interface ITransportServer {
	// Lifecycle
	start(): Promise<void>;
	stop(): Promise<void>;

	// Request handling (F2B)
	onRequest(handler: RequestHandler): void;

	// Event broadcasting (B2F)
	broadcast(event: TransportEvent): void;
	sendToClient(clientId: string, event: TransportEvent): void;
}

export type RequestHandler = (req: TransportRequest, context: RequestContext) => Promise<TransportResponse>;

export interface RequestContext {
	clientId: string;
	transport: 'http' | 'websocket';
	headers: Record<string, string>;
}
```

#### Request Router (Point d'entrée unique)

```typescript
// packages/web-backend/src/transport/RequestRouter.ts
export class RequestRouter {
	constructor(
		private factory: DataStoreFactory,
		private routes: typeof ROUTES_BY_BASE_URL
	) {}

	async handleRequest(req: TransportRequest, context: RequestContext): Promise<TransportResponse> {
		try {
			// 1. Find matching route
			const route = this.matchRoute(req.method, req.url);
			if (!route) {
				return { requestId: req.requestId, status: 404, data: { error: 'Not found' } };
			}

			// 2. Validate request (Zod)
			const validated = this.validateRequest(req, route);

			// 3. Get controller
			const controller = await this.getController(route.baseUrl);

			// 4. Execute handler
			const result = await controller.handleRequest(req.method, req.url, validated);

			// 5. Validate response (Zod)
			const validatedResponse = this.validateResponse(result, route);

			return {
				requestId: req.requestId,
				status: 200,
				data: validatedResponse,
			};
		} catch (error) {
			return this.handleError(req.requestId, error);
		}
	}
}
```

#### Implémentations Concrètes Backend

**A. HTTP Transport (Fastify avec SSE + Long Polling)**

```typescript
// packages/web-backend/src/transport/HttpTransportServer.ts
export class HttpTransportServer implements ITransportServer {
	private sseClients = new Map<string, FastifyReply>();
	private longPollingClients = new Map<string, { reply: FastifyReply; timer: NodeJS.Timeout }>();
	private eventQueue: TransportEvent[] = []; // Pour short polling fallback

	constructor(
		private fastify: FastifyInstance,
		private router: RequestRouter
	) {
		this.setupRoutes();
	}

	private setupRoutes() {
		// SSE Endpoint
		this.fastify.get('/api/events/stream', async (request, reply) => {
			const clientId = this.generateClientId();

			reply.raw.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			});

			this.sseClients.set(clientId, reply);

			// Send initial connection event
			reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

			request.raw.on('close', () => {
				this.sseClients.delete(clientId);
			});
		});

		// Long Polling Endpoint
		this.fastify.get('/api/events', async (request, reply) => {
			const clientId = this.generateClientId();

			// Wait up to 30s for events
			const timeout = setTimeout(() => {
				this.longPollingClients.delete(clientId);
				reply.send([]); // No events, return empty array
			}, 30000);

			this.longPollingClients.set(clientId, { reply, timer: timeout });

			// If we already have queued events, send immediately
			if (this.eventQueue.length > 0) {
				clearTimeout(timeout);
				this.longPollingClients.delete(clientId);
				reply.send([...this.eventQueue]);
				this.eventQueue = [];
			}
		});
	}

	onRequest(handler: RequestHandler): void {
		// Already handled by existing Fastify routes
		// Minor adaptation to convert FastifyRequest → TransportRequest
	}

	broadcast(event: TransportEvent): void {
		const eventData = JSON.stringify(event);

		// 1. Send via SSE to all connected clients
		this.sseClients.forEach((reply, clientId) => {
			try {
				reply.raw.write(`data: ${eventData}\n\n`);
			} catch (error) {
				console.error(`SSE send failed for client ${clientId}`, error);
				this.sseClients.delete(clientId);
			}
		});

		// 2. Send via Long Polling to waiting clients
		this.longPollingClients.forEach(({ reply, timer }, clientId) => {
			clearTimeout(timer);
			reply.send([event]);
			this.longPollingClients.delete(clientId);
		});

		// 3. Queue for short polling clients (keep last 100 events)
		this.eventQueue.push(event);
		if (this.eventQueue.length > 100) {
			this.eventQueue.shift();
		}
	}

	sendToClient(clientId: string, event: TransportEvent): void {
		const sseClient = this.sseClients.get(clientId);
		if (sseClient) {
			sseClient.raw.write(`data: ${JSON.stringify(event)}\n\n`);
			return;
		}

		const longPollingClient = this.longPollingClients.get(clientId);
		if (longPollingClient) {
			clearTimeout(longPollingClient.timer);
			longPollingClient.reply.send([event]);
			this.longPollingClients.delete(clientId);
		}
	}
}
```

**B. WebSocket Transport (Backend)**

```typescript
// packages/web-backend/src/transport/WebSocketTransportServer.ts
export class WebSocketTransportServer implements ITransportServer {
	private wss: WebSocketServer;
	private clients = new Map<string, WebSocket>();
	private router: RequestRouter;

	async start(): Promise<void> {
		this.wss = new WebSocketServer({ port: 3000, path: '/ws' });

		this.wss.on('connection', (ws, req) => {
			const clientId = this.generateClientId();
			this.clients.set(clientId, ws);

			ws.on('message', async data => {
				const message = JSON.parse(data.toString());

				if (message.type === 'request') {
					const context: RequestContext = {
						clientId,
						transport: 'websocket',
						headers: {},
					};

					const response = await this.router.handleRequest(message, context);
					ws.send(JSON.stringify({ type: 'response', ...response }));
				}
			});

			ws.on('close', () => {
				this.clients.delete(clientId);
			});
		});
	}

	broadcast(event: TransportEvent): void {
		const message = JSON.stringify({ type: 'event', ...event });
		this.clients.forEach(ws => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(message);
			}
		});
	}
}
```

#### Adaptation des Controllers

```typescript
// packages/web-backend/src/controllers/TasksController.ts
// AVANT (Fastify-specific):
export default class TasksController implements LazyController<typeof TASKS_API_ROUTES> {
  configureRoutes(add: RouteWrapperFunc<typeof TASKS_API_ROUTES>) {
    add('GET', '/api/tasks/', async ({ query }) => {
      return this.service.getTasksData(query);
    });
  }
}

// APRÈS (Transport-agnostic):
export default class TasksController implements LazyController<typeof TASKS_API_ROUTES> {
  // Fastify adapter (unchanged for backward compatibility)
  configureRoutes(add: RouteWrapperFunc<typeof TASKS_API_ROUTES>) {
    add('GET', '/api/tasks/', async ({ query }) => {
      return this.handleGetTasks({ query });
    });
  }

  // Generic handler (used by all transports)
  async handleGetTasks(req: { query?: TasksQuery }): Promise<TasksData> {
    return this.service.getTasksData(req.query);
  }
}
```

### 4. **Configuration et Modes**

#### Configuration Centralisée

```typescript
// packages/web-frontend/src/app/config/transport.config.ts
export const getTransportConfig = (): TransportConfig => {
	// 1. Check environment variable for override
	const override = process.env.REACT_APP_TRANSPORT_TYPE as TransportType | undefined;

	// 2. Check localStorage for debug mode
	const debugMode = localStorage.getItem('transport-debug-mode') as TransportType | null;

	// 3. Default based on environment
	const type =
		override ||
		debugMode ||
		(process.env.NODE_ENV === 'test' ? 'mock' : process.env.NODE_ENV === 'production' ? 'websocket' : 'websocket');

	return {
		type,
		fallback: 'http',
		http: {
			baseUrl: API_BASE_URL,
			polling: { enabled: true, interval: 5000 },
		},
		websocket: {
			url: API_BASE_URL.replace('http', 'ws') + '/ws',
			reconnect: true,
		},
		mock: {
			latency: 100,
			errorRate: 0,
		},
	};
};
```

#### Debug Panel (Dev Tools)

```typescript
// packages/web-frontend/src/app/components/debug/TransportDebugPanel.tsx
export const TransportDebugPanel = () => {
  const [currentTransport, setCurrentTransport] = useState<TransportType>('websocket');

  const switchTransport = (type: TransportType) => {
    localStorage.setItem('transport-debug-mode', type);
    window.location.reload(); // Reload to apply
  };

  return (
    <div>
      <h3>Transport Debug</h3>
      <button onClick={() => switchTransport('websocket')}>WebSocket</button>
      <button onClick={() => switchTransport('http')}>HTTP</button>
      <button onClick={() => switchTransport('mock')}>Mock</button>

      <div>Current: {currentTransport}</div>
      <div>Connected: {transportClient.isConnected()}</div>
      <div>Stats: {JSON.stringify(transportClient.getStats())}</div>
    </div>
  );
};
```

### 5. **Événements Backend → Frontend**

#### Types d'Événements (Prioritaires)

```typescript
// packages/shared-frontend-backend/src/transport/events.ts
export type EventType =
	| 'task_created'
	| 'task_updated'
	| 'task_deleted'
	| 'task_status_changed'
	| 'worker_connected'
	| 'worker_disconnected'
	| 'worker_state_changed'
	| 'system_alert'
	| 'system_error'
	| 'system_warning'
	| 'metrics_updated'
	| 'throughput_changed'
	| 'latency_changed';

export interface TaskEventData {
	taskId: string;
	task: Task;
	previousStatus?: TaskStatus;
}

export interface WorkerEventData {
	workerId: string;
	worker: Worker;
	previousState?: WorkerState;
}

export interface SystemAlertData {
	severity: 'error' | 'warning' | 'info';
	message: string;
	details?: any;
}

export interface MetricsEventData {
	timestamp: string;
	throughput?: number;
	latency?: number;
	taskCounts?: Record<TaskStatus, number>;
	workerCounts?: Record<WorkerState, number>;
}
```

#### EventBus Backend

```typescript
// packages/web-backend/src/events/EventBus.ts
export class EventBus {
	constructor(private transports: ITransportServer[]) {
		this.setupOrchestratorListener();
	}

	// Setup listener pour les événements de l'orchestrator
	private setupOrchestratorListener() {
		// Backend écoute les WebSocket updates de l'orchestrator
		// et les retransmet aux clients frontend via les transports
		// Exemple: écouter les updates du StateManager de l'orchestrator
		// via polling ou WebSocket si Backend→Orchestrator a aussi un transport
	}

	emit(eventType: EventType, data: any) {
		const event: TransportEvent = {
			type: eventType,
			data,
			timestamp: new Date().toISOString(),
		};

		this.transports.forEach(transport => {
			transport.broadcast(event);
		});
	}

	emitToClient(clientId: string, eventType: EventType, data: any) {
		const event: TransportEvent = {
			type: eventType,
			data,
			timestamp: new Date().toISOString(),
		};

		this.transports.forEach(transport => {
			transport.sendToClient(clientId, event);
		});
	}
}
```

#### Utilisation dans les Services

```typescript
// packages/web-backend/src/services/TasksService.ts
export class TasksService {
	constructor(
		private orchestratorRepository: OrchestratorRepository,
		private eventBus: EventBus // Nouvelle dépendance
	) {}

	async createTask(data: CreateTaskDto): Promise<Task> {
		const task = await this.orchestratorRepository.createTask(data);

		// Notifier tous les clients
		this.eventBus.emit('task_created', task);

		return task;
	}
}
```

#### Réception Frontend

```typescript
// packages/web-frontend/src/app/pages/tasks/useTasks.ts
export const useTasks = () => {
	const [tasks, setTasks] = useState<Task[]>([]);
	const transportClient = useTransportClient();

	useEffect(() => {
		// Subscribe to all task events
		const unsubscribeCreated = transportClient.on<TaskEventData>('task_created', data => {
			setTasks(prev => [...prev, data.task]);
		});

		const unsubscribeUpdated = transportClient.on<TaskEventData>('task_updated', data => {
			setTasks(prev => prev.map(t => (t.id === data.taskId ? data.task : t)));
		});

		const unsubscribeDeleted = transportClient.on<TaskEventData>('task_deleted', data => {
			setTasks(prev => prev.filter(t => t.id !== data.taskId));
		});

		return () => {
			unsubscribeCreated();
			unsubscribeUpdated();
			unsubscribeDeleted();
		};
	}, [transportClient]);

	const createTask = async (data: CreateTaskDto) => {
		const response = await transportClient.request<Task>({
			requestId: generateId(),
			method: 'POST',
			url: '/api/tasks/',
			body: data,
		});

		// Pas besoin de mettre à jour localement, l'événement le fera
		return response.data;
	};
};
```

#### Migration: Suppression de useOrchestratorWebSocket

```typescript
// ❌ AVANT: packages/web-frontend/src/app/hooks/useOrchestratorWebSocket.ts
// Ce fichier sera COMPLÈTEMENT SUPPRIMÉ

// ❌ AVANT: packages/web-frontend/src/app/pages/dashboard/useDashboard.ts
export const useDashboard = () => {
  const { lastMessage, isConnected } = useOrchestratorWebSocket(); // À SUPPRIMER

  useEffect(() => {
    if (lastMessage?.type === 'state_update') {
      setData(lastMessage.data);
    }
  }, [lastMessage]);
};

// ✅ APRÈS: packages/web-frontend/src/app/pages/dashboard/useDashboard.ts
export const useDashboard = () => {
  const transportClient = useTransportClient(); // NOUVEAU

  useEffect(() => {
    const unsubscribe = transportClient.on<MetricsEventData>('metrics_updated', (data) => {
      setData(data);
    });
    return unsubscribe;
  }, [transportClient]);
};
```

## Plan d'Implémentation

### Phase 1: Abstractions de Base

**Fichiers:**

- `packages/shared-frontend-backend/src/transport/protocol.ts` - Types partagés
- `packages/web-frontend/src/framework/transport/ITransportClient.ts` - Interface client
- `packages/web-backend/src/transport/ITransportServer.ts` - Interface serveur

**Tests:**

- Tests unitaires pour les types et interfaces

### Phase 2: Implémentations Mock

**Fichiers:**

- `packages/web-frontend/src/framework/transport/MockTransportClient.ts`
- `packages/web-frontend/src/framework/transport/MockTransportClient.test.ts`

**Tests:**

- Tous les scénarios: latence, erreurs, déconnexions
- Logs des requêtes, simulation d'événements
- Validation que les autres tests peuvent utiliser ce mock

### Phase 3: HTTP Transport (SSE + Long/Short Polling)

**Frontend:**

- `packages/web-frontend/src/framework/transport/HttpTransportClient.ts`
- `packages/web-frontend/src/framework/transport/HttpTransportClient.test.ts`
- Support SSE (priorité), Long Polling (fallback), Short Polling (dernier recours)
- Auto-detection et fallback automatique

**Backend:**

- `packages/web-backend/src/transport/HttpTransportServer.ts` (adapter Fastify existant)
- `packages/web-backend/src/transport/RequestRouter.ts` (point d'entrée unique)
- Endpoint `/api/events/stream` pour SSE
- Endpoint `/api/events` pour Long Polling (timeout 30s) et Short Polling

**Tests:**

- Requêtes F2B (GET, POST, PUT, DELETE)
- Événements B2F via SSE
- Événements B2F via Long Polling (avec timeout)
- Événements B2F via Short Polling (fallback)
- Fallback automatique SSE → Long Polling → Short Polling
- Gestion d'erreurs, timeouts, reconnexion
- Validation Zod

### Phase 4: WebSocket Transport

**Frontend:**

- `packages/web-frontend/src/framework/transport/WebSocketTransportClient.ts`
- `packages/web-frontend/src/framework/transport/WebSocketTransportClient.test.ts`
- Corrélation requête/réponse via requestId
- Auto-reconnect avec backoff

**Backend:**

- `packages/web-backend/src/transport/WebSocketTransportServer.ts`
- Réutilisation du RequestRouter
- Broadcasting d'événements

**Tests:**

- Requêtes F2B via WebSocket
- Événements B2F (push actif)
- Reconnexion automatique
- Corrélation requestId
- Gestion de multiples clients simultanés

### Phase 5: Factory et Fallback

**Fichiers:**

- `packages/web-frontend/src/framework/transport/TransportFactory.ts`
- `packages/web-frontend/src/framework/transport/FallbackTransportClient.ts`
- Configuration centralisée (`transport.config.ts`)

**Tests:**

- Création de transports selon config
- Fallback automatique WS → HTTP
- Switch en mode debug

### Phase 6: EventBus Backend

**Fichiers:**

- `packages/web-backend/src/events/EventBus.ts`
- Injection dans les services (TasksService, etc.)

**Tests:**

- Émission d'événements
- Broadcast à tous les clients
- Émission ciblée à un client

### Phase 7: Adaptation des Controllers

**Fichiers:**

- Mise à jour de tous les controllers pour exposer handlers génériques
- Maintien de la compatibilité Fastify

**Tests:**

- Validation que les controllers fonctionnent via HTTP et WS
- Tests existants passent toujours

### Phase 8: Migration Frontend (CRITIQUE)

**Fichiers à supprimer:**

- ❌ `packages/web-frontend/src/app/hooks/useOrchestratorWebSocket.ts` - SUPPRIMER COMPLÈTEMENT
- ❌ Toutes les références à `useOrchestratorWebSocket` dans le codebase

**Fichiers à migrer:**

- `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts` - Remplacer useOrchestratorWebSocket par ITransportClient
- `packages/web-frontend/src/app/pages/tasks/useTasks.ts` - Utiliser ITransportClient pour événements
- `packages/web-frontend/src/app/pages/workers/useWorkers.ts` - Migrer vers ITransportClient
- `packages/web-frontend/src/app/pages/workspaces/useWorkspaces.ts` - Migrer vers ITransportClient

**Nouveaux patterns:**

- Subscribe à des événements typés (`task_created`, `worker_connected`, etc.) au lieu de messages WebSocket génériques
- Utiliser `transportClient.request()` pour requêtes F2B
- Utiliser `transportClient.on()` pour événements B2F

**Tests:**

- Tests E2E avec chaque transport (Mock, HTTP/SSE, WebSocket)
- Vérification que tous les hooks fonctionnent avec tous les transports
- Tests de migration pour vérifier que l'ancien code WebSocket est complètement supprimé

### Phase 9: Debug Tools

**Fichiers:**

- `packages/web-frontend/src/app/components/debug/TransportDebugPanel.tsx`
- Panel pour switch de transport en dev

### Phase 10: Documentation

**Fichiers:**

- `.claude/docs/transport-architecture.md`
- Guide d'utilisation
- Exemples de configuration

## Fichiers Critiques

**Nouveaux:**

- `packages/shared-frontend-backend/src/transport/protocol.ts`
- `packages/web-frontend/src/framework/transport/ITransportClient.ts`
- `packages/web-frontend/src/framework/transport/HttpTransportClient.ts`
- `packages/web-frontend/src/framework/transport/WebSocketTransportClient.ts`
- `packages/web-frontend/src/framework/transport/MockTransportClient.ts`
- `packages/web-frontend/src/framework/transport/TransportFactory.ts`
- `packages/web-backend/src/transport/ITransportServer.ts`
- `packages/web-backend/src/transport/HttpTransportServer.ts`
- `packages/web-backend/src/transport/WebSocketTransportServer.ts`
- `packages/web-backend/src/transport/RequestRouter.ts`
- `packages/web-backend/src/events/EventBus.ts`

**À Supprimer:**

- `packages/web-frontend/src/app/hooks/useOrchestratorWebSocket.ts` - SUPPRIMER
- Toutes les références à ce hook dans le codebase

**À Modifier:**

- `packages/web-backend/src/controllers/*.ts` - Ajout de handlers génériques
- `packages/web-frontend/src/app/pages/*/use*.ts` - Migration vers ITransportClient (suppression useOrchestratorWebSocket)
- `packages/web-backend/src/services/*.ts` - Injection EventBus pour émettre événements B2F

## Avantages de cette Architecture

1. **Transport Agnostique**: Controllers et Services ne connaissent pas le transport
2. **Fortement Typé**: Protocol partagé, validation Zod, type-safety end-to-end
3. **Testable**: Mock transport pour tests isolés, contrôle total sur latence/erreurs
4. **Fallback**: Dégradation gracieuse WS → SSE → Long Polling
5. **Debug**: Switch facile entre transports pour débug
6. **Single Entry Point**: RequestRouter centralise la logique (backend)
7. **Événements**: EventBus permet B2F facilement
8. **Extensible**: Ajout de nouveaux transports (gRPC) sans changer la logique métier
