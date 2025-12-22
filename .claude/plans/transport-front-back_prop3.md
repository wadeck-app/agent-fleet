# Transport Layer Architecture: Frontend ↔ Backend Communication (Proposition 3 - Hybride)

## Vue d'ensemble

Architecture hybride combinant le meilleur des propositions 1 et 2:
- **Type safety maximal** via `ALL_API_ROUTES` (Prop2)
- **Mock transport avancé** avec in-memory state & recording (Prop2)
- **SSE/Long Polling sophistiqué** comme option pour temps réel (Prop1)
- **Testing strategy complète** (Prop2)
- **Configuration flexible** dynamique + event modes (Hybride)

**Principes:**
- Type safety end-to-end (compile-time errors, not runtime)
- Transport-agnostic application layer
- Progressive enhancement: Polling → Long Polling → SSE → WebSocket
- Powerful testing with mock transport (stub, in-memory, recording)
- Zero breaking changes to existing code

## Architecture en Couches

### Frontend
```
Application (React hooks, components)
      ↓
Services/API Layer (tasksApi, workersApi...)
      ↓
Transport Client Interface (ITransportClient)
      ↓
Transport Adapters (WebSocket | REST+SSE | Mock)
```

### Backend
```
Transport Adapters (WebSocket | REST+SSE)
      ↓
Transport Server Interface (ITransportServer)
      ↓
Transport Router (maps requests to controllers)
      ↓
Controllers (existing TasksController, etc.)
      ↓
Services → Repositories → Storage
```

---

## 1. Shared Protocol Types (packages/shared-frontend-backend)

### 1.1 Transport Protocol Types

**Fichier:** `packages/shared-frontend-backend/src/transport/TransportProtocol.ts`

```typescript
// Request-Response pattern (F2B)
export interface TransportRequest<TBody = unknown> {
  id: string;                           // UUID for request/response matching
  method: HttpMethod;                   // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string;                         // '/api/tasks', '/api/workers/:id', etc.
  query?: Record<string, any>;
  params?: Record<string, string>;      // URL params (/api/tasks/:id)
  body?: TBody;
  headers?: Record<string, string>;
  timestamp: number;
}

export interface TransportResponse<TBody = unknown> {
  id: string;                           // Matches request.id
  status: number;                       // HTTP status codes (200, 404, 500, etc.)
  body?: TBody;
  error?: TransportError;
  headers?: Record<string, string>;
  timestamp: number;
}

export interface TransportError {
  code: string;                         // 'NOT_FOUND', 'VALIDATION_ERROR', etc.
  message: string;
  details?: any;
}

// Event pattern (B2F)
export interface TransportEvent<TData = unknown> {
  id: string;                           // Event unique ID
  type: string;                         // 'task:created', 'worker:status', etc.
  data: TData;
  timestamp: number;
}
```

### 1.2 Typed API Registry (Prop2 - Type Safety)

**Fichier:** `packages/shared-frontend-backend/src/transport/TypedTransport.ts`

```typescript
import { ALL_API_ROUTES } from '../types';
import type { PathsForMethod, RouteQuery, RouteBody, RouteResponse } from '../route-builder';

// Extract all possible paths and methods from ALL_API_ROUTES
export type ApiPath = keyof typeof ALL_API_ROUTES;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Type-safe request builder
export type TypedRequest<M extends HttpMethod, P extends PathsForMethod<M>> = {
  method: M;
  path: P;
  query?: RouteQuery<M, P>;
  params?: Record<string, string>;
  body?: RouteBody<M, P>;
};

// Type-safe response
export type TypedResponse<M extends HttpMethod, P extends PathsForMethod<M>> =
  RouteResponse<M, P>;
```

### 1.3 Event Types Registry (Prop2 - Sophisticated Events)

**Fichier:** `packages/shared-frontend-backend/src/transport/EventTypes.ts`

```typescript
import type { Task, Worker, Workspace } from '../types';

// CRUD Events (generic pattern)
export type CrudEventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed';

// Resource-specific CRUD events
export type ResourceEvent<Resource extends string, Data> = {
  [K in CrudEventType as `${Resource}:${K}`]: Data;
};

// Business-specific events
export interface BusinessEvents {
  'task:assigned': { taskId: string; workerId: string; assignedAt: number };
  'task:priority_changed': { taskId: string; oldPriority: number; newPriority: number };
  'worker:heartbeat': { workerId: string; timestamp: number; status: string };
  'worker:capacity_changed': { workerId: string; capacity: number };
  'workspace:quota_exceeded': { workspaceId: string; quotaType: string; usage: number; limit: number };
  'workspace:archived': { workspaceId: string; archivedAt: number };
}

// Combined event registry (CRUD + Business)
export type EventTypes =
  & ResourceEvent<'task', Task>
  & ResourceEvent<'worker', Worker>
  & ResourceEvent<'workspace', Workspace>
  & BusinessEvents;

// Event type helper
export type EventType = keyof EventTypes;
export type EventData<T extends EventType> = EventTypes[T];

// Type guard
export function isEventType(type: string): type is EventType {
  return type.includes(':');
}
```

---

## 2. Frontend Architecture

### 2.1 Transport Client Interface

**Fichier:** `packages/web-frontend/src/transport/ITransportClient.ts`

```typescript
import type { HttpMethod, PathsForMethod, TypedRequest, TypedResponse } from '@shared/transport';
import type { EventType, EventData } from '@shared/transport/EventTypes';

export interface ITransportClient {
  // Request-Response (F2B) - strongly typed via ALL_API_ROUTES
  request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: {
      query?: TypedRequest<M, P>['query'];
      params?: TypedRequest<M, P>['params'];
      body?: TypedRequest<M, P>['body'];
      headers?: Record<string, string>;
    }
  ): Promise<TypedResponse<M, P>>;

  // Event subscription (B2F)
  subscribe<E extends EventType>(
    event: E,
    handler: (data: EventData<E>) => void
  ): UnsubscribeFunction;

  subscribeAll(
    handler: (event: EventType, data: any) => void
  ): UnsubscribeFunction;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Transport type
  getTransportType(): TransportType;

  // Lifecycle
  onConnectionStateChange(handler: (state: ConnectionState) => void): UnsubscribeFunction;
}

export type TransportType = 'websocket' | 'rest' | 'rest-sse' | 'rest-long-polling' | 'mock';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type UnsubscribeFunction = () => void;
```

### 2.2 Transport Factory & Configuration (Hybride)

**Fichier:** `packages/web-frontend/src/transport/TransportFactory.ts`

```typescript
export type EventMode = 'sse' | 'long-polling' | 'polling';

export interface TransportConfig {
  // Base URL for REST or WebSocket
  baseUrl: string;
  wsUrl?: string;

  // Transport mode selection
  mode?: 'websocket' | 'rest' | 'auto' | 'mock';
  forceRest?: boolean;                  // Debug: force REST

  // REST event mode (Prop1 feature, opt-in)
  eventMode?: EventMode;                // Default: 'polling'
  sseEndpoint?: string;                 // Default: '/api/events/stream'
  pollingEndpoint?: string;             // Default: '/api/events'

  // Timeouts
  requestTimeout?: number;              // Default 30s
  connectionTimeout?: number;           // Default 10s

  // Reconnection (for WebSocket)
  reconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectDelay?: number;              // Base delay for exponential backoff

  // Polling intervals
  pollingInterval?: number;             // Short polling: default 2000ms
  longPollingTimeout?: number;          // Long polling: default 30000ms

  // Mock options
  mock?: boolean;
  mockOptions?: MockTransportOptions;
}

export class TransportFactory {
  static create(config: TransportConfig): ITransportClient {
    // 1. Check for mock mode (tests, isolated dev)
    if (config.mock || config.mode === 'mock') {
      return new MockTransportClient(config.mockOptions || {});
    }

    // 2. Force REST for debug
    if (config.forceRest || config.mode === 'rest') {
      return new RestTransportClient(config);
    }

    // 3. Explicit WebSocket
    if (config.mode === 'websocket') {
      return new WebSocketTransportClient(config);
    }

    // 4. Auto mode: try WebSocket with REST fallback
    return new AdaptiveTransportClient(config);
  }

  // Load config from env + localStorage override
  static createFromEnv(): ITransportClient {
    const envConfig = this.loadEnvConfig();
    const runtimeConfig = this.loadRuntimeConfig();
    const mergedConfig = { ...envConfig, ...runtimeConfig };

    return this.create(mergedConfig);
  }

  private static loadEnvConfig(): TransportConfig {
    return {
      baseUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3738',
      wsUrl: import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:3738',
      mode: import.meta.env.VITE_TRANSPORT_MODE as TransportConfig['mode'] || 'auto',
      eventMode: import.meta.env.VITE_EVENT_MODE as EventMode || 'polling',
      requestTimeout: parseInt(import.meta.env.VITE_REQUEST_TIMEOUT || '30000'),
      pollingInterval: parseInt(import.meta.env.VITE_POLLING_INTERVAL || '2000'),
      longPollingTimeout: parseInt(import.meta.env.VITE_LONG_POLLING_TIMEOUT || '30000'),
    };
  }

  private static loadRuntimeConfig(): Partial<TransportConfig> {
    const stored = localStorage.getItem('transport_config');
    return stored ? JSON.parse(stored) : {};
  }
}
```

**Fichier:** `packages/web-frontend/src/transport/RuntimeTransportConfig.ts`

```typescript
export class RuntimeTransportConfig {
  static setTransportMode(mode: 'websocket' | 'rest' | 'auto' | 'mock') {
    const config = this.getConfig();
    config.mode = mode;
    this.saveConfig(config);
  }

  static setEventMode(mode: EventMode) {
    const config = this.getConfig();
    config.eventMode = mode;
    this.saveConfig(config);
  }

  static forceRest(enabled: boolean) {
    const config = this.getConfig();
    config.forceRest = enabled;
    this.saveConfig(config);
  }

  static getConfig(): Partial<TransportConfig> {
    const stored = localStorage.getItem('transport_config');
    return stored ? JSON.parse(stored) : {};
  }

  private static saveConfig(config: Partial<TransportConfig>) {
    localStorage.setItem('transport_config', JSON.stringify(config));
  }
}
```

### 2.3 REST Transport with Event Modes (Hybride: Prop2 base + Prop1 SSE/Long Polling)

**Fichier:** `packages/web-frontend/src/transport/adapters/RestTransportClient.ts`

```typescript
export class RestTransportClient implements ITransportClient {
  private connectionState: ConnectionState = 'disconnected';
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private lastEventTimestamp: number = Date.now();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();

  // Event streaming components
  private eventSource: EventSource | null = null;              // For SSE
  private longPollingAbortController: AbortController | null = null;  // For long polling
  private pollingTimer: NodeJS.Timer | null = null;            // For short polling

  constructor(private config: TransportConfig) {}

  async connect(): Promise<void> {
    this.updateConnectionState('connecting');

    // Test connection with health check
    try {
      const response = await fetch(`${this.config.baseUrl}/api/health`);
      if (response.ok) {
        this.updateConnectionState('connected');
      } else {
        throw new Error('Health check failed');
      }
    } catch (error) {
      this.updateConnectionState('error');
      throw error;
    }
  }

  async request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: any
  ): Promise<any> {
    // Build URL with params
    let url = `${this.config.baseUrl}${path}`;
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, encodeURIComponent(value as string));
      });
    }

    // Add query parameters
    if (options?.query) {
      const queryString = new URLSearchParams(options.query).toString();
      url += `?${queryString}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw {
        status: response.status,
        message: error.message || response.statusText,
        code: error.code || 'HTTP_ERROR',
      };
    }

    return response.json();
  }

  subscribe<E extends EventType>(
    event: E,
    handler: (data: EventData<E>) => void
  ): UnsubscribeFunction {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());

      // Start event streaming if this is the first subscription
      if (this.eventHandlers.size === 1) {
        this.startEventStreaming();
      }
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
      if (this.eventHandlers.get(event)?.size === 0) {
        this.eventHandlers.delete(event);
      }

      // Stop event streaming if no more subscriptions
      if (this.eventHandlers.size === 0) {
        this.stopEventStreaming();
      }
    };
  }

  private startEventStreaming() {
    const mode = this.config.eventMode || 'polling';

    switch (mode) {
      case 'sse':
        this.setupSSE();
        break;
      case 'long-polling':
        this.setupLongPolling();
        break;
      case 'polling':
      default:
        this.setupShortPolling();
        break;
    }
  }

  // SSE Implementation (From Prop1)
  private setupSSE() {
    try {
      const endpoint = this.config.sseEndpoint || '/api/events/stream';
      this.eventSource = new EventSource(`${this.config.baseUrl}${endpoint}`);

      this.eventSource.onmessage = (event) => {
        try {
          const transportEvent = JSON.parse(event.data) as TransportEvent;
          this.dispatchEvent(transportEvent);
        } catch (error) {
          console.error('SSE message parse error', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.warn('SSE connection failed, falling back to long polling', error);
        this.eventSource?.close();
        this.eventSource = null;

        // Auto-fallback to long polling
        this.config.eventMode = 'long-polling';
        this.setupLongPolling();
      };

      console.log('Using SSE for events');
    } catch (error) {
      console.warn('SSE not supported, using long polling');
      this.config.eventMode = 'long-polling';
      this.setupLongPolling();
    }
  }

  // Long Polling Implementation (From Prop1)
  private async setupLongPolling() {
    const poll = async () => {
      try {
        this.longPollingAbortController = new AbortController();
        const endpoint = this.config.pollingEndpoint || '/api/events';

        const response = await fetch(
          `${this.config.baseUrl}${endpoint}?since=${this.lastEventTimestamp}`,
          {
            signal: this.longPollingAbortController.signal,
            // Server will hold this request up to longPollingTimeout (default 30s)
          }
        );

        if (response.ok) {
          const events = await response.json() as TransportEvent[];
          events.forEach(event => {
            this.dispatchEvent(event);
            this.lastEventTimestamp = Math.max(this.lastEventTimestamp, event.timestamp);
          });
        }

        // Immediate next poll
        if (this.longPollingAbortController && !this.longPollingAbortController.signal.aborted) {
          poll();
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.warn('Long polling error, waiting before retry', error);
          setTimeout(poll, 5000);
        }
      }
    };

    poll();
    console.log('Using Long Polling for events');
  }

  // Short Polling Implementation (Prop2)
  private setupShortPolling() {
    const poll = async () => {
      try {
        const endpoint = this.config.pollingEndpoint || '/api/events';
        const response = await fetch(
          `${this.config.baseUrl}${endpoint}?since=${this.lastEventTimestamp}`
        );

        if (response.ok) {
          const events = await response.json() as TransportEvent[];
          events.forEach(event => {
            this.dispatchEvent(event);
            this.lastEventTimestamp = Math.max(this.lastEventTimestamp, event.timestamp);
          });
        }
      } catch (error) {
        console.error('Polling error', error);
      }
    };

    this.pollingTimer = setInterval(poll, this.config.pollingInterval || 2000);
    console.log('Using Short Polling for events');
  }

  private stopEventStreaming() {
    // Stop SSE
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Stop Long Polling
    if (this.longPollingAbortController) {
      this.longPollingAbortController.abort();
      this.longPollingAbortController = null;
    }

    // Stop Short Polling
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private dispatchEvent(event: TransportEvent) {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event.data));
    }
  }

  disconnect(): Promise<void> {
    this.stopEventStreaming();
    this.updateConnectionState('disconnected');
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getTransportType(): TransportType {
    const mode = this.config.eventMode || 'polling';
    switch (mode) {
      case 'sse': return 'rest-sse';
      case 'long-polling': return 'rest-long-polling';
      default: return 'rest';
    }
  }

  subscribeAll(handler: (event: EventType, data: any) => void): UnsubscribeFunction {
    // For REST, we need to poll all event types
    // This is less efficient, prefer specific subscriptions
    throw new Error('subscribeAll not efficiently supported in REST mode. Use specific event subscriptions.');
  }

  onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  private updateConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.connectionStateHandlers.forEach(handler => handler(state));
  }
}

type EventHandler = (data: any) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;
```

### 2.4 WebSocket Transport (From Prop2)

**Fichier:** `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`

```typescript
import type { ITransportClient, TransportConfig } from '../ITransportClient';
import { TransportRequest, TransportResponse, TransportEvent } from '@shared/transport';

export class WebSocketTransportClient implements ITransportClient {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();

  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private config: TransportConfig) {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.updateConnectionState('connecting');

    return new Promise((resolve, reject) => {
      const wsUrl = this.config.wsUrl || this.config.baseUrl.replace('http', 'ws');
      this.ws = new WebSocket(`${wsUrl}/ws`);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, this.config.connectionTimeout || 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.updateConnectionState('connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        this.updateConnectionState('error');
        reject(error);
      };

      this.ws.onmessage = (event) => this.handleMessage(event);

      this.ws.onclose = () => {
        this.updateConnectionState('disconnected');
        this.handleReconnect();
      };
    });
  }

  async request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: any
  ): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const request: TransportRequest = {
      id: generateUuid(),
      method,
      path,
      query: options?.query,
      params: options?.params,
      body: options?.body,
      headers: options?.headers,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error('Request timeout'));
      }, this.config.requestTimeout || 30000);

      this.pendingRequests.set(request.id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(request));
    });
  }

  subscribe<E extends EventType>(
    event: E,
    handler: (data: EventData<E>) => void
  ): UnsubscribeFunction {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  private handleMessage(event: MessageEvent) {
    const data = JSON.parse(event.data);

    if (this.isResponse(data)) {
      this.handleResponse(data as TransportResponse);
    } else if (this.isEvent(data)) {
      this.handleEvent(data as TransportEvent);
    }
  }

  private handleResponse(response: TransportResponse) {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(response.error);
    } else {
      pending.resolve(response.body);
    }
  }

  private handleEvent(event: TransportEvent) {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event.data));
    }
  }

  private handleReconnect() {
    if (!this.config.reconnect) return;
    if (this.reconnectAttempts >= (this.config.reconnectMaxAttempts || 10)) {
      this.updateConnectionState('error');
      return;
    }

    this.updateConnectionState('reconnecting');
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30s
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(err => {
        console.error('Reconnection failed', err);
      });
    }, delay);
  }

  private isResponse(data: any): boolean {
    return 'id' in data && 'status' in data;
  }

  private isEvent(data: any): boolean {
    return 'type' in data && 'data' in data && !('status' in data);
  }

  private updateConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.connectionStateHandlers.forEach(handler => handler(state));
  }

  disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.updateConnectionState('disconnected');
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getTransportType(): TransportType {
    return 'websocket';
  }

  subscribeAll(handler: (event: EventType, data: any) => void): UnsubscribeFunction {
    // WebSocket can efficiently subscribe to all events
    const allEventsHandler = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (this.isEvent(data)) {
        handler(data.type, data.data);
      }
    };

    // Store reference for cleanup
    (this as any)._allEventsHandler = allEventsHandler;

    return () => {
      delete (this as any)._allEventsHandler;
    };
  }

  onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

type EventHandler = (data: any) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

function generateUuid(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### 2.5 Mock Transport with Advanced Features (From Prop2)

**Fichier:** `packages/web-frontend/src/transport/adapters/MockTransportClient.ts`

```typescript
export interface MockTransportOptions {
  // 1. Stub data
  stubData?: Record<string, any>;

  // 2. Latency simulation
  latency?: {
    min: number;
    max: number;
  };

  // 3. Failure simulation
  failureRate?: number;                 // 0.0 to 1.0 (e.g., 0.1 = 10% failure)
  simulateDisconnect?: boolean;
  simulateTimeout?: boolean;

  // 4. Scenario recording/replay
  recordScenario?: boolean;
  replayScenario?: RecordedScenario;

  // 5. In-memory state machine
  inMemoryState?: boolean;              // Full CRUD with consistency
  initialData?: {
    tasks?: Task[];
    workers?: Worker[];
    workspaces?: Workspace[];
  };
}

export interface RecordedScenario {
  requests: Array<{
    timestamp: number;
    method: string;
    path: string;
    options: any;
    response: any;
  }>;
  events: Array<{
    timestamp: number;
    type: string;
    data: any;
  }>;
}

export class MockTransportClient implements ITransportClient {
  private connectionState: ConnectionState = 'disconnected';
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();

  // In-memory state
  private inMemoryData: {
    tasks: Map<string, Task>;
    workers: Map<string, Worker>;
    workspaces: Map<string, Workspace>;
  };

  // Recording
  private recordedScenario: RecordedScenario | null = null;
  private scenarioStartTime: number = 0;

  constructor(private options: MockTransportOptions) {
    // Initialize in-memory state
    this.inMemoryData = {
      tasks: new Map(options.initialData?.tasks?.map(t => [t.id, t]) || []),
      workers: new Map(options.initialData?.workers?.map(w => [w.id, w]) || []),
      workspaces: new Map(options.initialData?.workspaces?.map(w => [w.id, w]) || []),
    };

    // Initialize recording
    if (options.recordScenario) {
      this.recordedScenario = { requests: [], events: [] };
      this.scenarioStartTime = Date.now();
    }
  }

  async connect(): Promise<void> {
    await this.simulateLatency();

    if (this.options.simulateDisconnect) {
      throw new Error('Simulated connection failure');
    }

    this.updateConnectionState('connected');
  }

  async request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: any
  ): Promise<any> {
    await this.simulateLatency();

    // Simulate random failures
    if (Math.random() < (this.options.failureRate || 0)) {
      throw new Error('Simulated request failure');
    }

    // Simulate timeout
    if (this.options.simulateTimeout) {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 35000)
      );
    }

    let response: any;

    // Replay mode
    if (this.options.replayScenario) {
      response = this.replayRequest(method, path, options);
    }
    // In-memory state machine
    else if (this.options.inMemoryState) {
      response = await this.handleInMemoryRequest(method, path, options);
    }
    // Stub data
    else {
      response = this.getStubData(path);
    }

    // Record request
    if (this.options.recordScenario && this.recordedScenario) {
      this.recordedScenario.requests.push({
        timestamp: Date.now() - this.scenarioStartTime,
        method,
        path,
        options,
        response,
      });
    }

    return response;
  }

  subscribe<E extends EventType>(
    event: E,
    handler: (data: EventData<E>) => void
  ): UnsubscribeFunction {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // In replay mode, schedule recorded events
    if (this.options.replayScenario) {
      this.scheduleReplayEvents(event);
    }

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  // Helper: manually trigger events (for tests)
  simulateEvent<E extends EventType>(event: E, data: EventData<E>) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }

    // Record event
    if (this.options.recordScenario && this.recordedScenario) {
      this.recordedScenario.events.push({
        timestamp: Date.now() - this.scenarioStartTime,
        type: event,
        data,
      });
    }
  }

  // Helper: get recorded scenario (for saving)
  getRecordedScenario(): RecordedScenario | null {
    return this.recordedScenario;
  }

  private async simulateLatency() {
    if (this.options.latency) {
      const delay =
        Math.random() * (this.options.latency.max - this.options.latency.min) +
        this.options.latency.min;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private getStubData(path: string): any {
    return this.options.stubData?.[path] || [];
  }

  private async handleInMemoryRequest(
    method: string,
    path: string,
    options?: any
  ): Promise<any> {
    // Parse path to determine resource
    const { resource, id } = this.parsePath(path);

    if (!resource) throw new Error(`Unknown path: ${path}`);

    const store = this.inMemoryData[resource as keyof typeof this.inMemoryData];
    if (!store) throw new Error(`Unknown resource: ${resource}`);

    switch (method) {
      case 'GET':
        if (id) {
          const item = store.get(id);
          if (!item) throw { status: 404, message: 'Not found' };
          return item;
        }
        return Array.from(store.values());

      case 'POST':
        const newItem = { id: generateUuid(), ...options?.body };
        store.set(newItem.id, newItem);
        this.simulateEvent(`${resource}:created` as EventType, newItem);
        return newItem;

      case 'PUT':
      case 'PATCH':
        if (!id) throw { status: 400, message: 'ID required' };
        const existing = store.get(id);
        if (!existing) throw { status: 404, message: 'Not found' };
        const updated = { ...existing, ...options?.body };
        store.set(id, updated);
        this.simulateEvent(`${resource}:updated` as EventType, updated);
        return updated;

      case 'DELETE':
        if (!id) throw { status: 400, message: 'ID required' };
        const deleted = store.get(id);
        if (!deleted) throw { status: 404, message: 'Not found' };
        store.delete(id);
        this.simulateEvent(`${resource}:deleted` as EventType, { id });
        return { success: true };

      default:
        throw { status: 405, message: 'Method not allowed' };
    }
  }

  private parsePath(path: string): { resource: string | null; id: string | null } {
    // Parse paths like '/api/tasks' or '/api/tasks/123'
    const match = path.match(/^\/api\/(\w+)(?:\/([^\/]+))?/);
    if (!match) return { resource: null, id: null };
    return { resource: match[1], id: match[2] || null };
  }

  private replayRequest(method: string, path: string, options: any): any {
    if (!this.options.replayScenario) return null;

    const recorded = this.options.replayScenario.requests.find(
      r => r.method === method && r.path === path &&
           JSON.stringify(r.options) === JSON.stringify(options)
    );

    return recorded?.response || null;
  }

  private scheduleReplayEvents(event: string) {
    if (!this.options.replayScenario) return;

    const events = this.options.replayScenario.events.filter(e => e.type === event);
    events.forEach(evt => {
      setTimeout(() => {
        this.simulateEvent(evt.type as EventType, evt.data);
      }, evt.timestamp);
    });
  }

  disconnect(): Promise<void> {
    this.updateConnectionState('disconnected');
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getTransportType(): TransportType {
    return 'mock';
  }

  subscribeAll(handler: (event: EventType, data: any) => void): UnsubscribeFunction {
    const unsubscribers: UnsubscribeFunction[] = [];
    // Subscribe to all known event types
    return () => unsubscribers.forEach(unsub => unsub());
  }

  onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  private updateConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.connectionStateHandlers.forEach(handler => handler(state));
  }
}

type EventHandler = (data: any) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;
```

### 2.6 Adaptive Transport (From Prop2)

**Fichier:** `packages/web-frontend/src/transport/adapters/AdaptiveTransportClient.ts`

```typescript
export class AdaptiveTransportClient implements ITransportClient {
  private currentTransport: ITransportClient | null = null;
  private attemptedWebSocket = false;

  constructor(private config: TransportConfig) {}

  async connect(): Promise<void> {
    // Try WebSocket first
    if (!this.attemptedWebSocket) {
      this.attemptedWebSocket = true;
      try {
        this.currentTransport = new WebSocketTransportClient(this.config);
        await this.currentTransport.connect();
        console.log('Using WebSocket transport');
        return;
      } catch (error) {
        console.warn('WebSocket connection failed, falling back to REST', error);
      }
    }

    // Fallback to REST
    this.currentTransport = new RestTransportClient(this.config);
    await this.currentTransport.connect();
    console.log(`Using REST transport (mode: ${this.config.eventMode || 'polling'})`);
  }

  // Delegate all methods to current transport
  async request<M extends HttpMethod, P extends PathsForMethod<M>>(
    method: M,
    path: P,
    options?: any
  ): Promise<any> {
    if (!this.currentTransport) {
      throw new Error('Transport not initialized');
    }
    return this.currentTransport.request(method, path, options);
  }

  subscribe<E extends EventType>(
    event: E,
    handler: (data: EventData<E>) => void
  ): UnsubscribeFunction {
    if (!this.currentTransport) {
      throw new Error('Transport not initialized');
    }
    return this.currentTransport.subscribe(event, handler);
  }

  subscribeAll(handler: (event: EventType, data: any) => void): UnsubscribeFunction {
    if (!this.currentTransport) {
      throw new Error('Transport not initialized');
    }
    return this.currentTransport.subscribeAll(handler);
  }

  disconnect(): Promise<void> {
    return this.currentTransport?.disconnect() || Promise.resolve();
  }

  isConnected(): boolean {
    return this.currentTransport?.isConnected() || false;
  }

  getTransportType(): TransportType {
    return this.currentTransport?.getTransportType() || 'rest';
  }

  onConnectionStateChange(handler: (state: ConnectionState) => void): UnsubscribeFunction {
    if (!this.currentTransport) {
      return () => {};
    }
    return this.currentTransport.onConnectionStateChange(handler);
  }
}
```

### 2.7 Transport Provider (React Context)

**Fichier:** `packages/web-frontend/src/transport/TransportProvider.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ITransportClient } from './ITransportClient';
import { TransportFactory } from './TransportFactory';

const TransportContext = createContext<ITransportClient | null>(null);

export function TransportProvider({
  children,
  transport
}: {
  children: React.ReactNode;
  transport?: ITransportClient; // For tests: inject mock transport
}) {
  const [client] = useState<ITransportClient>(() =>
    transport || TransportFactory.createFromEnv()
  );

  useEffect(() => {
    client.connect().catch(err => {
      console.error('Failed to connect transport', err);
    });

    return () => {
      client.disconnect();
    };
  }, [client]);

  return (
    <TransportContext.Provider value={client}>
      {children}
    </TransportContext.Provider>
  );
}

export function useTransport(): ITransportClient {
  const transport = useContext(TransportContext);
  if (!transport) {
    throw new Error('useTransport must be used within TransportProvider');
  }
  return transport;
}
```

### 2.8 Debug Panel (Hybride)

**Fichier:** `packages/web-frontend/src/app/components/debug/TransportDebugPanel.tsx`

```typescript
export function TransportDebugPanel() {
  const transport = useTransport();
  const [mode, setMode] = useState<TransportConfig['mode']>('auto');
  const [eventMode, setEventMode] = useState<EventMode>('polling');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    return transport.onConnectionStateChange(state => {
      setConnectionState(state);
    });
  }, [transport]);

  const handleModeChange = async (newMode: TransportConfig['mode']) => {
    RuntimeTransportConfig.setTransportMode(newMode);
    setMode(newMode);
    window.location.reload();
  };

  const handleEventModeChange = async (newEventMode: EventMode) => {
    RuntimeTransportConfig.setEventMode(newEventMode);
    setEventMode(newEventMode);
    window.location.reload();
  };

  return (
    <div className="transport-debug-panel">
      <h3>Transport Debug Panel</h3>

      <div>
        <label>Current Transport:</label>
        <span className="badge">{transport.getTransportType()}</span>
      </div>

      <div>
        <label>Connection State:</label>
        <span className={`status status-${connectionState}`}>{connectionState}</span>
      </div>

      <div>
        <label>Transport Mode:</label>
        <select value={mode} onChange={(e) => handleModeChange(e.target.value as any)}>
          <option value="auto">Auto (WS → REST fallback)</option>
          <option value="websocket">WebSocket only</option>
          <option value="rest">REST only</option>
          <option value="mock">Mock (for testing)</option>
        </select>
      </div>

      <div>
        <label>REST Event Mode:</label>
        <select value={eventMode} onChange={(e) => handleEventModeChange(e.target.value as any)}>
          <option value="polling">Short Polling (2s)</option>
          <option value="long-polling">Long Polling (30s hold)</option>
          <option value="sse">SSE (Server-Sent Events)</option>
        </select>
        <small>Only applies when using REST transport</small>
      </div>

      <div>
        <button onClick={() => RuntimeTransportConfig.forceRest(true)}>
          Force REST (Debug)
        </button>
      </div>
    </div>
  );
}
```

---

## 3. Backend Architecture

### 3.1 Transport Server Interface

**Fichier:** `packages/web-backend/src/transport/ITransportServer.ts`

```typescript
import type { EventType, EventData } from '@shared/transport/EventTypes';

export interface ITransportServer {
  // Initialize transport (register routes, WebSocket handlers, etc.)
  initialize(app: FastifyInstance, router: TransportRouter): Promise<void>;

  // Broadcast events to clients (B2F)
  broadcast<E extends EventType>(event: E, data: EventData<E>): void;

  // Send event to specific client
  sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void;

  // Connection lifecycle hooks
  onClientConnected(handler: (clientId: string) => void): void;
  onClientDisconnected(handler: (clientId: string) => void): void;

  // Get connected clients
  getConnectedClients(): string[];
}
```

### 3.2 WebSocket Transport Server

**Fichier:** `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`

```typescript
import type { ITransportServer } from '../ITransportServer';
import type { TransportRequest, TransportResponse, TransportEvent } from '@shared/transport';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

export class WebSocketTransportServer implements ITransportServer {
  private clients = new Map<string, WebSocket>();
  private clientConnectedHandlers: Array<(clientId: string) => void> = [];
  private clientDisconnectedHandlers: Array<(clientId: string) => void> = [];

  constructor() {}

  async initialize(app: FastifyInstance, router: TransportRouter): Promise<void> {
    // Register @fastify/websocket
    await app.register(require('@fastify/websocket'));

    // WebSocket endpoint: ws://host:port/ws
    app.get('/ws', { websocket: true }, (connection, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, connection.socket);

      console.log(`WebSocket client connected: ${clientId}`);
      this.clientConnectedHandlers.forEach(handler => handler(clientId));

      connection.socket.on('message', async (rawMessage: Buffer) => {
        try {
          const message = rawMessage.toString();
          const request: TransportRequest = JSON.parse(message);

          // Route request to controller via router
          const response = await router.handleRequest(request);

          // Send response back
          connection.socket.send(JSON.stringify(response));
        } catch (error) {
          console.error('WebSocket message error', error);
          const errorResponse: TransportResponse = {
            id: 'unknown',
            status: 500,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Failed to process request',
            },
            timestamp: Date.now(),
          };
          connection.socket.send(JSON.stringify(errorResponse));
        }
      });

      connection.socket.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
        this.clientDisconnectedHandlers.forEach(handler => handler(clientId));
      });

      connection.socket.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
  }

  broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    const eventMessage: TransportEvent = {
      id: this.generateEventId(),
      type: event,
      data,
      timestamp: Date.now(),
    };

    const message = JSON.stringify(eventMessage);

    this.clients.forEach((client, clientId) => {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(message);
        } catch (error) {
          console.error(`Failed to send event to client ${clientId}`, error);
        }
      }
    });
  }

  sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
    const client = this.clients.get(clientId);
    if (!client || client.readyState !== 1) {
      console.warn(`Client ${clientId} not connected`);
      return;
    }

    const eventMessage: TransportEvent = {
      id: this.generateEventId(),
      type: event,
      data,
      timestamp: Date.now(),
    };

    try {
      client.send(JSON.stringify(eventMessage));
    } catch (error) {
      console.error(`Failed to send event to client ${clientId}`, error);
    }
  }

  onClientConnected(handler: (clientId: string) => void): void {
    this.clientConnectedHandlers.push(handler);
  }

  onClientDisconnected(handler: (clientId: string) => void): void {
    this.clientDisconnectedHandlers.push(handler);
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 3.3 REST Transport Server with SSE/Long Polling (Hybride)

**Fichier:** `packages/web-backend/src/transport/adapters/RestTransportServer.ts`

```typescript
export class RestTransportServer implements ITransportServer {
  // SSE clients
  private sseClients = new Map<string, FastifyReply>();

  // Long polling clients (waiting for events)
  private longPollingClients = new Map<string, { reply: FastifyReply; timer: NodeJS.Timeout }>();

  // Event buffer for short polling
  private eventBuffer: TransportEvent[] = [];
  private maxBufferSize = 1000;
  private maxEventAge = 60000; // 60 seconds

  async initialize(app: FastifyInstance, router: TransportRouter): Promise<void> {
    // SSE Endpoint (Prop1)
    app.get('/api/events/stream', async (request, reply) => {
      const clientId = this.generateClientId();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      this.sseClients.set(clientId, reply);

      // Send initial connection event
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

      request.raw.on('close', () => {
        this.sseClients.delete(clientId);
      });
    });

    // Polling Endpoint (Prop2 + Prop1 long polling)
    app.get('/api/events', async (request, reply) => {
      const { since, types, long } = request.query as {
        since?: string;
        types?: string;
        long?: string; // 'true' for long polling
      };

      const sinceTimestamp = since ? parseInt(since) : 0;
      const eventTypes = types ? types.split(',') : [];

      // Filter events
      let events = this.eventBuffer.filter(evt => evt.timestamp > sinceTimestamp);

      if (eventTypes.length > 0) {
        events = events.filter(evt => eventTypes.includes(evt.type));
      }

      // Short polling: return immediately
      if (long !== 'true') {
        return events;
      }

      // Long polling: wait for events or timeout
      if (events.length > 0) {
        return events;
      }

      const clientId = this.generateClientId();
      const timeout = setTimeout(() => {
        this.longPollingClients.delete(clientId);
        reply.send([]); // No events, return empty array
      }, 30000); // 30s timeout

      this.longPollingClients.set(clientId, { reply, timer: timeout });

      // Note: response will be sent when an event arrives (via broadcast)
      // or when timeout fires
    });

    // Periodic cleanup of old events
    setInterval(() => {
      this.cleanupOldEvents();
    }, 10000); // Every 10 seconds
  }

  broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    const eventMessage: TransportEvent = {
      id: this.generateEventId(),
      type: event,
      data,
      timestamp: Date.now(),
    };

    const eventData = JSON.stringify(eventMessage);

    // 1. Send via SSE to all connected clients (Prop1)
    this.sseClients.forEach((reply, clientId) => {
      try {
        reply.raw.write(`data: ${eventData}\n\n`);
      } catch (error) {
        console.error(`SSE send failed for client ${clientId}`, error);
        this.sseClients.delete(clientId);
      }
    });

    // 2. Send via Long Polling to waiting clients (Prop1)
    this.longPollingClients.forEach(({ reply, timer }, clientId) => {
      clearTimeout(timer);
      reply.send([eventMessage]);
      this.longPollingClients.delete(clientId);
    });

    // 3. Buffer for short polling clients (Prop2)
    this.eventBuffer.push(eventMessage);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }
  }

  sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
    const eventMessage: TransportEvent = {
      id: this.generateEventId(),
      type: event,
      data,
      timestamp: Date.now(),
    };

    // Try SSE first
    const sseClient = this.sseClients.get(clientId);
    if (sseClient) {
      sseClient.raw.write(`data: ${JSON.stringify(eventMessage)}\n\n`);
      return;
    }

    // Try long polling
    const longPollingClient = this.longPollingClients.get(clientId);
    if (longPollingClient) {
      clearTimeout(longPollingClient.timer);
      longPollingClient.reply.send([eventMessage]);
      this.longPollingClients.delete(clientId);
      return;
    }

    // Fallback: add to buffer for short polling
    console.warn(`Client ${clientId} not connected, adding to buffer`);
    this.eventBuffer.push(eventMessage);
  }

  onClientConnected(handler: (clientId: string) => void): void {
    // SSE tracks connections, REST polling doesn't
  }

  onClientDisconnected(handler: (clientId: string) => void): void {
    // SSE tracks disconnections, REST polling doesn't
  }

  getConnectedClients(): string[] {
    return Array.from(this.sseClients.keys());
  }

  private cleanupOldEvents() {
    const cutoffTime = Date.now() - this.maxEventAge;
    this.eventBuffer = this.eventBuffer.filter(evt => evt.timestamp > cutoffTime);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 3.4 Transport Router (From Prop2)

**Fichier:** `packages/web-backend/src/transport/TransportRouter.ts`

```typescript
import type { TransportRequest, TransportResponse } from '@shared/transport';

export class TransportRouter {
  private controllerHandlers = new Map<string, { controller: any; method: string }>();

  constructor() {}

  async handleRequest(request: TransportRequest): Promise<TransportResponse> {
    try {
      // Parse route
      const route = this.parseRoute(request.path, request.method);

      if (!route) {
        return this.errorResponse(request.id, 404, 'Route not found');
      }

      // Get controller and method
      const { controller, method } = route;

      // Build request object (same format as Fastify)
      const fastifyLikeRequest = {
        params: request.params || {},
        query: request.query || {},
        body: request.body,
        headers: request.headers || {},
      };

      // Execute controller method
      const result = await controller[method](fastifyLikeRequest);

      return {
        id: request.id,
        status: 200,
        body: result,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return this.errorResponse(
        request.id,
        error.statusCode || error.status || 500,
        error.message || 'Internal server error',
        error.code
      );
    }
  }

  private parseRoute(path: string, method: string): { controller: any; method: string } | null {
    const routeKey = `${method} ${path}`;
    const handler = this.controllerHandlers.get(routeKey);
    return handler || null;
  }

  private errorResponse(
    id: string,
    status: number,
    message: string,
    code?: string
  ): TransportResponse {
    return {
      id,
      status,
      error: {
        code: code || `HTTP_${status}`,
        message,
      },
      timestamp: Date.now(),
    };
  }

  // Register handler (called during controller setup)
  registerHandler(method: string, path: string, controller: any, handlerMethod: string) {
    const routeKey = `${method} ${path}`;
    this.controllerHandlers.set(routeKey, { controller, method: handlerMethod });
  }
}
```

### 3.5 Event Broadcaster

**Fichier:** `packages/web-backend/src/transport/EventBroadcaster.ts`

```typescript
export class EventBroadcaster {
  constructor(private servers: ITransportServer[]) {}

  broadcast<E extends EventType>(event: E, data: EventData<E>): void {
    this.servers.forEach(server => server.broadcast(event, data));
  }

  sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
    this.servers.forEach(server => server.sendToClient(clientId, event, data));
  }
}
```

### 3.6 Server Initialization

**Fichier:** `packages/web-backend/src/server.ts`

```typescript
import { TransportServerFactory } from './transport/TransportServerFactory';
import { TransportRouter } from './transport/TransportRouter';
import { EventBroadcaster } from './transport/EventBroadcaster';

export async function createServer(config: ServerConfig) {
  const app = fastify({ ... });

  // ... existing setup (CORS, helmet, etc.) ...

  // Initialize transport
  const transportServers = TransportServerFactory.create({ mode: 'both' });
  const transportRouter = new TransportRouter();
  const eventBroadcaster = new EventBroadcaster(transportServers);

  // Initialize each transport server
  for (const server of transportServers) {
    await server.initialize(app, transportRouter);
  }

  // Inject eventBroadcaster into controllers
  // (via dependency injection in controller factory)

  // ... rest of server setup ...

  return app;
}
```

---

## 4. Configuration System

### 4.1 Environment Variables

**Fichier:** `packages/web-frontend/.env.example`

```bash
# Backend URLs
VITE_BACKEND_URL=http://localhost:3738
VITE_BACKEND_WS_URL=ws://localhost:3738

# Transport mode: websocket | rest | auto | mock
VITE_TRANSPORT_MODE=auto

# REST event mode: polling | long-polling | sse
VITE_EVENT_MODE=polling

# Endpoints
VITE_SSE_ENDPOINT=/api/events/stream
VITE_POLLING_ENDPOINT=/api/events

# Timeouts (milliseconds)
VITE_REQUEST_TIMEOUT=30000
VITE_CONNECTION_TIMEOUT=10000
VITE_LONG_POLLING_TIMEOUT=30000

# Polling interval (milliseconds)
VITE_POLLING_INTERVAL=2000

# Reconnection settings
VITE_RECONNECT_ENABLED=true
VITE_RECONNECT_MAX_ATTEMPTS=10
VITE_RECONNECT_DELAY=1000

# Debug
VITE_TRANSPORT_DEBUG=false
```

**Fichier:** `packages/web-backend/.env.example`

```bash
# Transport mode: websocket | rest | both
TRANSPORT_MODE=both

# WebSocket settings
WS_HEARTBEAT_INTERVAL=30000

# Event buffer settings
EVENT_BUFFER_SIZE=1000
EVENT_MAX_AGE=60000
```

---

## 5. Testing Strategy (From Prop2)

### 5.1 Transport-Specific Unit Tests

**Fichier:** `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.test.ts`

```typescript
describe('WebSocketTransportClient', () => {
  let transport: WebSocketTransportClient;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    transport = new WebSocketTransportClient({ wsUrl: 'ws://test' });
  });

  describe('request/response', () => {
    it('should send request and receive response', async () => {
      await transport.connect();

      const responsePromise = transport.request('GET', '/api/tasks' as any);

      const sentMessage = JSON.parse(mockWs.lastSentMessage);
      expect(sentMessage.method).toBe('GET');
      expect(sentMessage.path).toBe('/api/tasks');

      mockWs.receiveMessage({
        id: sentMessage.id,
        status: 200,
        body: [{ id: '1', name: 'Task 1' }],
        timestamp: Date.now(),
      });

      const result = await responsePromise;
      expect(result).toEqual([{ id: '1', name: 'Task 1' }]);
    });
  });

  describe('events', () => {
    it('should subscribe to events', async () => {
      await transport.connect();

      const handler = jest.fn();
      transport.subscribe('task:created', handler);

      mockWs.receiveMessage({
        id: 'evt1',
        type: 'task:created',
        data: { id: '1', name: 'New Task' },
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledWith({ id: '1', name: 'New Task' });
    });
  });
});
```

### 5.2 Application Tests with Mock Transport

**Fichier:** `packages/web-frontend/src/app/hooks/useTasks.test.ts`

```typescript
describe('useTasks', () => {
  let mockTransport: MockTransportClient;

  beforeEach(() => {
    mockTransport = new MockTransportClient({
      inMemoryState: true,
      initialData: {
        tasks: [
          { id: '1', name: 'Task 1', status: 'pending' },
          { id: '2', name: 'Task 2', status: 'completed' },
        ],
      },
    });
  });

  it('should fetch tasks', async () => {
    const { result } = renderHook(() => useTasks(), {
      wrapper: ({ children }) => (
        <TransportProvider transport={mockTransport}>
          {children}
        </TransportProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
    });
  });

  it('should handle task created event', async () => {
    const { result } = renderHook(() => useTasks(), {
      wrapper: ({ children }) => (
        <TransportProvider transport={mockTransport}>
          {children}
        </TransportProvider>
      ),
    });

    act(() => {
      mockTransport.simulateEvent('task:created', {
        id: '3',
        name: 'New Task',
        status: 'pending',
      });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(3);
    });
  });
});
```

---

## 6. Implementation Order

### Phase 1: Shared Protocol Types (1-2 days)
- Create `TransportProtocol.ts`, `TypedTransport.ts`, `EventTypes.ts`
- Test type helpers with existing `ALL_API_ROUTES`

### Phase 2: Frontend Mock Transport (2-3 days)
- Create `ITransportClient` interface
- Implement `MockTransportClient` with all 3 modes (stub, in-memory, recording)
- Write comprehensive unit tests
- Create `TransportFactory` and `TransportProvider`

### Phase 3: Frontend Integration with Mock (1-2 days)
- Modify `client.ts` to use transport (Option B wrapper)
- Update hooks to subscribe to events
- Remove `useOrchestratorWebSocket`
- Test with `MockTransportClient`

### Phase 4: Backend Base Transport (2-3 days)
- Create `ITransportServer`, `TransportRouter`, `EventBroadcaster`
- Implement `RestTransportServer` (polling mode only first)
- Add `/api/events` endpoint
- Test with existing REST routes

### Phase 5: WebSocket Implementation (3-4 days)
- Implement `WebSocketTransportClient` (frontend)
- Implement `WebSocketTransportServer` (backend)
- Write unit tests for both
- Test end-to-end WebSocket communication

### Phase 6: REST Advanced (SSE + Long Polling) (2-3 days)
- Add SSE support to `RestTransportClient`
- Add Long Polling support to `RestTransportClient`
- Add SSE endpoint `/api/events/stream` to `RestTransportServer`
- Add Long Polling logic to `RestTransportServer`
- Write unit tests for event modes
- Test auto-fallback: SSE → Long Polling → Short Polling

### Phase 7: Adaptive Transport (1-2 days)
- Implement `AdaptiveTransportClient`
- Test WebSocket → REST fallback
- Write unit tests

### Phase 8: Configuration & Debug (1-2 days)
- Add environment variables
- Implement `RuntimeTransportConfig`
- Create `TransportDebugPanel` UI
- Test config switching (including event modes)

### Phase 9: Controllers Integration (2-3 days)
- Inject `EventBroadcaster` into all controllers
- Add event emission after CRUD operations
- Test event flow end-to-end

### Phase 10: Testing & Documentation (2-3 days)
- Complete test suite (target >80% coverage)
- Test scenario recording/replay
- Write documentation
- Performance testing

**Total estimate: 18-28 days**

---

## 7. Critical Files Summary

### To Create

**Shared (packages/shared-frontend-backend):**
- `src/transport/TransportProtocol.ts`
- `src/transport/TypedTransport.ts`
- `src/transport/EventTypes.ts`

**Frontend (packages/web-frontend):**
- `src/transport/ITransportClient.ts`
- `src/transport/TransportFactory.ts`
- `src/transport/RuntimeTransportConfig.ts`
- `src/transport/TransportProvider.tsx`
- `src/transport/adapters/WebSocketTransportClient.ts`
- `src/transport/adapters/RestTransportClient.ts` (with SSE/Long Polling)
- `src/transport/adapters/MockTransportClient.ts` (advanced features)
- `src/transport/adapters/AdaptiveTransportClient.ts`
- `src/app/components/debug/TransportDebugPanel.tsx`

**Backend (packages/web-backend):**
- `src/transport/ITransportServer.ts`
- `src/transport/TransportRouter.ts`
- `src/transport/TransportServerFactory.ts`
- `src/transport/EventBroadcaster.ts`
- `src/transport/adapters/WebSocketTransportServer.ts`
- `src/transport/adapters/RestTransportServer.ts` (with SSE/Long Polling)

**Tests:**
- Frontend: `src/transport/adapters/*.test.ts` (3 files)
- Frontend: `src/app/hooks/*.test.ts` (update existing)
- Backend: `src/transport/*.test.ts`

### To Modify

**Frontend:**
- `src/app/api/client.ts` - Wrap `createTypedFetch` to use transport
- `src/app/hooks/useTasks.ts` - Subscribe to task events
- `src/app/hooks/useWorkers.ts` - Subscribe to worker events
- `src/app/hooks/useDashboard.ts` - Subscribe to dashboard events
- `src/app/hooks/useWorkspaces.ts` - Subscribe to workspace events

**Backend:**
- `src/server.ts` - Initialize transport servers
- `src/controllers/TasksController.ts` - Inject `EventBroadcaster`, emit events
- `src/controllers/WorkersController.ts` - Same
- `src/controllers/DashboardController.ts` - Same
- `src/controllers/WorkspacesController.ts` - Same

**Config:**
- `packages/web-frontend/.env.example`
- `packages/web-backend/.env.example`

### To Delete

**Frontend:**
- `src/app/hooks/useOrchestratorWebSocket.ts`

---

## 8. Success Criteria

- ✅ **Type Safety**: Zero breaking changes, full `ALL_API_ROUTES` typing preserved
- ✅ **Transport Agnostic**: Controllers work identically regardless of transport
- ✅ **Progressive Enhancement**: Polling → Long Polling → SSE → WebSocket
- ✅ **Mock Transport**: All 3 modes working (stub, in-memory, recording)
- ✅ **Event System**: CRUD + business events properly typed
- ✅ **Configuration**: Dynamic runtime config + event modes
- ✅ **Testing**: >80% coverage, transport-specific tests isolated
- ✅ **Migration**: `useOrchestratorWebSocket` removed
- ✅ **Architecture**: Frontend never talks to Orchestrator/Worker directly

---

## 9. Key Hybrid Benefits

### From Proposition 1 (SSE/Long Polling)
- ✅ Better real-time experience without WebSocket
- ✅ Native browser SSE support with auto-reconnect
- ✅ Long Polling reduces latency vs short polling
- ✅ Graceful fallback: SSE → Long Polling → Short Polling

### From Proposition 2 (Type Safety & Testing)
- ✅ Compile-time type checking via `ALL_API_ROUTES`
- ✅ Sophisticated event types (CRUD patterns, business events)
- ✅ Advanced mock transport (in-memory state, recording)
- ✅ Dynamic runtime configuration
- ✅ Comprehensive testing strategy

### Hybrid Enhancements
- ✅ **Flexible event modes**: Choose polling, long-polling, or SSE per environment
- ✅ **Debug panel**: Switch transport AND event mode at runtime
- ✅ **Opt-in complexity**: SSE/Long Polling available but not mandatory
- ✅ **Best of both worlds**: Type safety + real-time performance

---

## 10. Comparison Matrix

| Feature | Prop1 | Prop2 | **Prop3 (Hybrid)** |
|---------|-------|-------|-------------------|
| Type Safety | Basic | ★★★★★ | ★★★★★ |
| SSE Support | ★★★★★ | ✗ | ★★★★★ (opt-in) |
| Long Polling | ★★★★★ | ✗ | ★★★★★ (opt-in) |
| Short Polling | ★★★ | ★★★★★ | ★★★★★ (default) |
| Mock Transport | ★★ | ★★★★★ | ★★★★★ |
| Event Types | ★★ | ★★★★★ | ★★★★★ |
| Runtime Config | ★★ | ★★★★★ | ★★★★★ |
| Testing Strategy | ★★ | ★★★★★ | ★★★★★ |
| Complexity | High | Medium | Medium-High |
| Flexibility | Medium | High | ★★★★★ |

**Legend:**
- ★★★★★ Excellent
- ★★★★ Very Good
- ★★★ Good
- ★★ Fair
- ★ Limited
- ✗ Not Supported
