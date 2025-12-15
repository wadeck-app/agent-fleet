# Préparation de l'Orchestrateur pour l'Interface Web

## État Actuel

Après analyse du code existant, voici ce qui est déjà en place :

### ✅ Points forts existants

1. **StateManager avec EventEmitter** (`src/shared/StateManager.ts`)
   - Système d'events centralisé
   - Events pour tasks et workers déjà définis
   - Base solide pour broadcasting vers UI

2. **Protocole de messages structuré** (`src/shared/types.ts`)
   - MessageType enum bien défini
   - Messages typés pour tous les events
   - Workers ↔ Orchestrator déjà standardisé

3. **Architecture modulaire**
   - WorkerWebSocketServer bien isolé
   - TaskManager indépendant
   - Séparation des responsabilités claire

## Ce qui peut être préparé MAINTENANT

### 1. Étendre le StateManager pour les UI Events

**Objectif** : Ajouter des events spécifiques pour les futures interfaces web

**Fichier** : `src/shared/StateManager.ts`

```typescript
export enum StateEvent {
  // Existing events
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_DELETED = 'task_deleted',
  WORKER_CONNECTED = 'worker_connected',
  WORKER_DISCONNECTED = 'worker_disconnected',
  WORKER_TASK_ASSIGNED = 'worker_task_assigned',
  WORKER_TASK_RELEASED = 'worker_task_released',
  LOG_MESSAGE = 'log_message',

  // NEW: UI-specific events
  ORCHESTRATOR_STARTED = 'orchestrator_started',
  ORCHESTRATOR_STOPPING = 'orchestrator_stopping',
  ORCHESTRATOR_READY = 'orchestrator_ready',
  FLOW_EXECUTION_STARTED = 'flow_execution_started',
  FLOW_EXECUTION_PROGRESS = 'flow_execution_progress',
  FLOW_EXECUTION_COMPLETED = 'flow_execution_completed',
  FLOW_EXECUTION_FAILED = 'flow_execution_failed',
  METRICS_UPDATED = 'metrics_updated',
  SYSTEM_STATUS_CHANGED = 'system_status_changed'
}

export interface OrchestratorStatusData {
  status: 'starting' | 'ready' | 'stopping' | 'stopped';
  uptime: number;
  workersConnected: number;
  tasksInProgress: number;
  timestamp: string;
}

export interface MetricsData {
  taskThroughput: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
  };
  workerUtilization: {
    idle: number;
    busy: number;
    total: number;
  };
  averageTaskDuration: number; // milliseconds
  timestamp: string;
}

export class StateManager extends EventEmitter {
  // ... existing methods ...

  // NEW: Orchestrator lifecycle events
  emitOrchestratorStarted(): void {
    this.emit(StateEvent.ORCHESTRATOR_STARTED, {
      timestamp: new Date().toISOString()
    });
  }

  emitOrchestratorReady(): void {
    this.emit(StateEvent.ORCHESTRATOR_READY, {
      timestamp: new Date().toISOString()
    });
  }

  emitOrchestratorStopping(): void {
    this.emit(StateEvent.ORCHESTRATOR_STOPPING, {
      timestamp: new Date().toISOString()
    });
  }

  // NEW: Flow execution events (more granular than task events)
  emitFlowExecutionStarted(taskId: string, flowId: string): void {
    this.emit(StateEvent.FLOW_EXECUTION_STARTED, {
      taskId,
      flowId,
      timestamp: new Date().toISOString()
    });
  }

  emitFlowExecutionProgress(taskId: string, stepId: string, progress: any): void {
    this.emit(StateEvent.FLOW_EXECUTION_PROGRESS, {
      taskId,
      stepId,
      progress,
      timestamp: new Date().toISOString()
    });
  }

  emitFlowExecutionCompleted(taskId: string, result: any): void {
    this.emit(StateEvent.FLOW_EXECUTION_COMPLETED, {
      taskId,
      result,
      timestamp: new Date().toISOString()
    });
  }

  emitFlowExecutionFailed(taskId: string, error: string): void {
    this.emit(StateEvent.FLOW_EXECUTION_FAILED, {
      taskId,
      error,
      timestamp: new Date().toISOString()
    });
  }

  // NEW: Metrics events
  emitMetricsUpdated(metrics: MetricsData): void {
    this.emit(StateEvent.METRICS_UPDATED, { metrics });
  }

  // NEW: System status
  emitSystemStatusChanged(status: OrchestratorStatusData): void {
    this.emit(StateEvent.SYSTEM_STATUS_CHANGED, { status });
  }
}
```

**Impact** : Aucun breaking change, seulement des ajouts. L'UI pourra s'abonner à ces nouveaux events.

---

### 2. Créer un State Snapshot Service

**Objectif** : Permettre à une nouvelle UI de récupérer l'état complet au moment de la connexion

**Nouveau fichier** : `src/orchestrator/state/StateSnapshot.ts`

```typescript
import { Task, WorkerInfo } from '../../shared/types.js';
import { TaskManager } from '../core/TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';

export interface OrchestratorSnapshot {
  timestamp: string;
  orchestrator: {
    status: 'ready' | 'starting' | 'stopping';
    uptime: number; // milliseconds
    version: string;
  };
  tasks: {
    all: Task[];
    byStatus: Record<string, number>;
    total: number;
  };
  workers: {
    all: WorkerInfo[];
    connected: number;
    idle: number;
    busy: number;
  };
  metrics: {
    taskThroughput: {
      total: number;
      completed: number;
      failed: number;
      inProgress: number;
    };
    averageTaskDuration: number;
  };
}

/**
 * Service to capture and provide snapshots of the orchestrator state
 * Useful for new UI connections that need the full current state
 */
export class StateSnapshotService {
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private startTime: Date;

  constructor(taskManager: TaskManager, wsServer: WorkerWebSocketServer) {
    this.taskManager = taskManager;
    this.wsServer = wsServer;
    this.startTime = new Date();
  }

  /**
   * Get a complete snapshot of the current orchestrator state
   */
  getSnapshot(): OrchestratorSnapshot {
    const tasks = this.taskManager.getAllTasks();
    const workers = this.wsServer.getWorkers();
    const stats = this.taskManager.getStats();

    return {
      timestamp: new Date().toISOString(),
      orchestrator: {
        status: 'ready',
        uptime: Date.now() - this.startTime.getTime(),
        version: process.env.npm_package_version || '0.0.0'
      },
      tasks: {
        all: tasks,
        byStatus: stats.byStatus,
        total: stats.total
      },
      workers: {
        all: workers,
        connected: workers.length,
        idle: workers.filter(w => !w.taskId).length,
        busy: workers.filter(w => w.taskId).length
      },
      metrics: this.calculateMetrics(tasks)
    };
  }

  private calculateMetrics(tasks: Task[]) {
    const completed = tasks.filter(t => t.status === 'merged' || t.status === 'approved');
    const failed = tasks.filter(t => t.status === 'blocked' || t.status === 'cancelled');
    const inProgress = tasks.filter(t => t.status === 'in_progress');

    // Calculate average duration for completed tasks
    let totalDuration = 0;
    let count = 0;
    for (const task of completed) {
      const created = new Date(task.createdAt).getTime();
      const updated = new Date(task.updatedAt).getTime();
      totalDuration += updated - created;
      count++;
    }

    return {
      taskThroughput: {
        total: tasks.length,
        completed: completed.length,
        failed: failed.length,
        inProgress: inProgress.length
      },
      averageTaskDuration: count > 0 ? totalDuration / count : 0
    };
  }
}
```

**Intégration dans Orchestrator** (`src/orchestrator/core/index.ts`):

```typescript
import { StateSnapshotService } from '../state/StateSnapshot.js';

export class Orchestrator implements Shutdownable {
  // ... existing fields ...
  private snapshotService?: StateSnapshotService;

  private async initialize(): Promise<void> {
    // ... existing initialization ...

    // NEW: Initialize snapshot service
    this.snapshotService = new StateSnapshotService(this.taskManager, this.wsServer);
  }

  /**
   * Get current state snapshot (for UI connections)
   */
  getStateSnapshot(): OrchestratorSnapshot {
    return this.snapshotService?.getSnapshot() || {
      /* fallback empty snapshot */
    };
  }
}
```

---

### 3. Créer des Types pour les Messages UI

**Objectif** : Définir le protocole de communication Orchestrator ↔ UI (séparé du protocole workers)

**Nouveau fichier** : `src/orchestrator/ui-client/types.ts`

```typescript
/**
 * Message types for UI ↔ Orchestrator communication
 * Separate from worker messages to allow independent evolution
 */

export enum UIMessageType {
  // UI → Orchestrator (Commands)
  CONNECT = 'ui_connect',
  DISCONNECT = 'ui_disconnect',
  SUBSCRIBE = 'ui_subscribe',
  UNSUBSCRIBE = 'ui_unsubscribe',
  REQUEST_SNAPSHOT = 'ui_request_snapshot',
  START_FLOW = 'ui_start_flow',
  STOP_FLOW = 'ui_stop_flow',
  RETRY_TASK = 'ui_retry_task',
  DELETE_TASK = 'ui_delete_task',
  UPDATE_CONFIG = 'ui_update_config',

  // Orchestrator → UI (Updates)
  CONNECTED = 'ui_connected',
  SNAPSHOT = 'ui_snapshot',
  STATE_UPDATE = 'ui_state_update',
  COMMAND_RESULT = 'ui_command_result',
  ERROR = 'ui_error'
}

export interface BaseUIMessage {
  type: UIMessageType;
  timestamp: string;
  requestId?: string; // For tracking request/response pairs
}

// Commands (UI → Orchestrator)

export interface UIConnectMessage extends BaseUIMessage {
  type: UIMessageType.CONNECT;
  authToken: string;
  clientInfo: {
    userAgent?: string;
    version?: string;
  };
}

export interface UISubscribeMessage extends BaseUIMessage {
  type: UIMessageType.SUBSCRIBE;
  events: string[]; // List of StateEvent to subscribe to
}

export interface UIRequestSnapshotMessage extends BaseUIMessage {
  type: UIMessageType.REQUEST_SNAPSHOT;
}

export interface UIStartFlowMessage extends BaseUIMessage {
  type: UIMessageType.START_FLOW;
  flowId: string;
  inputs?: Record<string, any>;
  workerId?: string; // Optional: target specific worker
}

export interface UIStopFlowMessage extends BaseUIMessage {
  type: UIMessageType.STOP_FLOW;
  taskId: string;
}

export interface UIRetryTaskMessage extends BaseUIMessage {
  type: UIMessageType.RETRY_TASK;
  taskId: string;
}

// Updates (Orchestrator → UI)

export interface UIConnectedMessage extends BaseUIMessage {
  type: UIMessageType.CONNECTED;
  orchestratorId: string;
  version: string;
}

export interface UISnapshotMessage extends BaseUIMessage {
  type: UIMessageType.SNAPSHOT;
  snapshot: import('../state/StateSnapshot.js').OrchestratorSnapshot;
}

export interface UIStateUpdateMessage extends BaseUIMessage {
  type: UIMessageType.STATE_UPDATE;
  event: string; // StateEvent name
  data: any; // Event-specific data
}

export interface UICommandResultMessage extends BaseUIMessage {
  type: UIMessageType.COMMAND_RESULT;
  requestId: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface UIErrorMessage extends BaseUIMessage {
  type: UIMessageType.ERROR;
  error: string;
  details?: any;
}

export type UIMessage =
  | UIConnectMessage
  | UISubscribeMessage
  | UIRequestSnapshotMessage
  | UIStartFlowMessage
  | UIStopFlowMessage
  | UIRetryTaskMessage
  | UIConnectedMessage
  | UISnapshotMessage
  | UIStateUpdateMessage
  | UICommandResultMessage
  | UIErrorMessage;
```

---

### 4. Préparer le Hook Point pour la Future UI Client Connection

**Objectif** : Ajouter un système de hooks pour injecter la future connexion UI sans tout casser

**Nouveau fichier** : `src/orchestrator/ui-client/UIClientHook.ts`

```typescript
import { StateManager, StateEvent } from '../../shared/StateManager.js';
import { EventEmitter } from 'events';

/**
 * Hook point for UI client connections
 * Allows plugging in UI connectivity without modifying core orchestrator code
 *
 * Usage pattern:
 * 1. Core orchestrator registers this hook
 * 2. Hook listens to StateManager events
 * 3. Future UIConnectionManager will implement the actual broadcasting
 */
export class UIClientHook extends EventEmitter {
  private stateManager: StateManager;
  private isEnabled: boolean = false;

  constructor(stateManager: StateManager) {
    super();
    this.stateManager = stateManager;
  }

  /**
   * Enable the hook and start listening to state events
   */
  enable(): void {
    if (this.isEnabled) return;

    // Subscribe to all state events
    Object.values(StateEvent).forEach(event => {
      this.stateManager.on(event, (data: any) => {
        this.onStateEvent(event, data);
      });
    });

    this.isEnabled = true;
  }

  /**
   * Disable the hook
   */
  disable(): void {
    this.isEnabled = false;
    this.stateManager.removeAllListeners();
  }

  /**
   * Handle state event - override or listen to this in UI implementation
   */
  protected onStateEvent(event: StateEvent, data: any): void {
    // Emit to any UI clients listening
    // Future UIConnectionManager will listen to this
    this.emit('state_update', {
      event,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send a command result back to UI
   */
  sendCommandResult(requestId: string, success: boolean, data?: any, error?: string): void {
    this.emit('command_result', {
      requestId,
      success,
      data,
      error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast an error to all connected UIs
   */
  broadcastError(error: string, details?: any): void {
    this.emit('error', {
      error,
      details,
      timestamp: new Date().toISOString()
    });
  }
}
```

**Intégration dans Orchestrator** (`src/orchestrator/core/index.ts`):

```typescript
import { UIClientHook } from '../ui-client/UIClientHook.js';

export class Orchestrator implements Shutdownable {
  // ... existing fields ...
  private uiClientHook?: UIClientHook;

  private async initialize(): Promise<void> {
    // ... existing initialization ...

    // NEW: Initialize UI client hook (but don't enable yet)
    this.uiClientHook = new UIClientHook(this.stateManager);

    // Enable only if UI client mode is configured
    if (process.env.UI_CLIENT_ENABLED === 'true') {
      this.uiClientHook.enable();
      Logger.log('[Orchestrator] UI client hook enabled');
    }
  }

  /**
   * Get UI client hook for external UI connection managers
   */
  getUIClientHook(): UIClientHook | undefined {
    return this.uiClientHook;
  }
}
```

---

### 5. Améliorer le Logging Structuré

**Objectif** : Logger dans un format facilement streamable vers l'UI

**Modifier** : `src/shared/Logger.ts`

```typescript
export interface StructuredLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string; // 'orchestrator', 'worker', 'task-manager', etc.
  message: string;
  context?: Record<string, any>;
  taskId?: string;
  workerId?: string;
}

export class Logger {
  private static stateManager: StateManager | null = null;

  static initialize(stateManager: StateManager): void {
    this.stateManager = stateManager;
  }

  static log(message: string, context?: Record<string, any>): void {
    this.logStructured('info', 'system', message, context);
  }

  static debug(message: string, context?: Record<string, any>): void {
    this.logStructured('debug', 'system', message, context);
  }

  static error(message: string, error?: any, context?: Record<string, any>): void {
    this.logStructured('error', 'system', message, {
      ...context,
      error: error?.message || error
    });
  }

  // NEW: Structured logging
  private static logStructured(
    level: StructuredLogEntry['level'],
    component: string,
    message: string,
    context?: Record<string, any>
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      context
    };

    // Console output (existing behavior)
    console.log(`[${level.toUpperCase()}] ${message}`);

    // NEW: Emit to StateManager for UI streaming
    if (this.stateManager) {
      this.stateManager.emitLogMessage(JSON.stringify(entry));
    }
  }
}
```

---

### 6. Ajouter un Metrics Collector

**Objectif** : Collecter des métriques pour dashboard UI

**Nouveau fichier** : `src/orchestrator/metrics/MetricsCollector.ts`

```typescript
import { StateManager, StateEvent, MetricsData } from '../../shared/StateManager.js';
import { TaskManager } from '../core/TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';

export class MetricsCollector {
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private stateManager: StateManager;
  private interval: NodeJS.Timeout | null = null;
  private collectIntervalMs: number;

  constructor(
    taskManager: TaskManager,
    wsServer: WorkerWebSocketServer,
    stateManager: StateManager,
    collectIntervalMs: number = 5000 // 5 seconds default
  ) {
    this.taskManager = taskManager;
    this.wsServer = wsServer;
    this.stateManager = stateManager;
    this.collectIntervalMs = collectIntervalMs;
  }

  /**
   * Start collecting metrics periodically
   */
  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.collectAndEmit();
    }, this.collectIntervalMs);

    // Collect immediately on start
    this.collectAndEmit();
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private collectAndEmit(): void {
    const metrics = this.collectMetrics();
    this.stateManager.emitMetricsUpdated(metrics);
  }

  private collectMetrics(): MetricsData {
    const tasks = this.taskManager.getAllTasks();
    const workers = this.wsServer.getWorkers();

    // Task throughput
    const completed = tasks.filter(t =>
      t.status === 'merged' || t.status === 'approved'
    ).length;
    const failed = tasks.filter(t =>
      t.status === 'blocked' || t.status === 'cancelled'
    ).length;
    const inProgress = tasks.filter(t =>
      t.status === 'in_progress'
    ).length;

    // Worker utilization
    const idle = workers.filter(w => !w.taskId).length;
    const busy = workers.filter(w => w.taskId).length;

    // Average task duration
    let totalDuration = 0;
    let durationCount = 0;
    for (const task of tasks) {
      if (task.status === 'merged' || task.status === 'approved') {
        const created = new Date(task.createdAt).getTime();
        const updated = new Date(task.updatedAt).getTime();
        totalDuration += updated - created;
        durationCount++;
      }
    }

    return {
      taskThroughput: {
        total: tasks.length,
        completed,
        failed,
        inProgress
      },
      workerUtilization: {
        idle,
        busy,
        total: workers.length
      },
      averageTaskDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      timestamp: new Date().toISOString()
    };
  }
}
```

**Intégration dans Orchestrator**:

```typescript
import { MetricsCollector } from '../metrics/MetricsCollector.js';

export class Orchestrator implements Shutdownable {
  private metricsCollector?: MetricsCollector;

  private async initialize(): Promise<void> {
    // ... existing initialization ...

    // NEW: Initialize metrics collector
    this.metricsCollector = new MetricsCollector(
      this.taskManager,
      this.wsServer,
      this.stateManager,
      5000 // Collect every 5 seconds
    );
  }

  async start(): Promise<void> {
    // ... existing start logic ...

    // NEW: Start metrics collection
    this.metricsCollector?.start();
  }

  async shutdown(): Promise<void> {
    // NEW: Stop metrics collection
    this.metricsCollector?.stop();

    // ... existing shutdown logic ...
  }
}
```

---

## Plan d'Implémentation

### Phase 1: Foundation (Maintenant - 1 semaine)
- [ ] Étendre StateManager avec nouveaux events
- [ ] Créer StateSnapshotService
- [ ] Améliorer Logger pour structured logging
- [ ] Créer types UI messages
- [ ] Tests unitaires pour tous les nouveaux composants

### Phase 2: Hooks & Metrics (Semaine 2)
- [ ] Implémenter UIClientHook
- [ ] Implémenter MetricsCollector
- [ ] Intégrer dans Orchestrator
- [ ] Documentation

### Phase 3: UI Client Manager (Plus tard, avec le frontend)
- [ ] Implémenter UIConnectionManager (WebSocket client)
- [ ] Authentication & command signing
- [ ] Intégrer avec UIClientHook
- [ ] Tests d'intégration

## Bénéfices de cette Préparation

### ✅ Avantages immédiats
- Meilleur observabilité (structured logs, metrics)
- Code plus testable (snapshots)
- Base solide pour monitoring même sans UI

### ✅ Facilite l'intégration future
- Pas de refactoring majeur nécessaire
- UI peut se brancher via hooks
- Protocol UI déjà défini
- Events déjà émis

### ✅ Zéro breaking change
- Tout est additionnel
- Backward compatible
- Peut être activé/désactivé via config

## Fichiers à Créer/Modifier

### Nouveaux fichiers
```
src/orchestrator/
├── state/
│   └── StateSnapshot.ts          [NEW]
├── ui-client/
│   ├── types.ts                  [NEW]
│   └── UIClientHook.ts           [NEW]
└── metrics/
    └── MetricsCollector.ts       [NEW]
```

### Fichiers à modifier
```
src/shared/
├── StateManager.ts               [EXTEND]
└── Logger.ts                     [IMPROVE]

src/orchestrator/core/
└── index.ts                      [INTEGRATE new services]
```

## Tests Recommandés

```typescript
// StateSnapshot.test.ts
describe('StateSnapshotService', () => {
  it('should capture complete orchestrator state', () => {
    const snapshot = service.getSnapshot();
    expect(snapshot).toHaveProperty('orchestrator');
    expect(snapshot).toHaveProperty('tasks');
    expect(snapshot).toHaveProperty('workers');
    expect(snapshot).toHaveProperty('metrics');
  });
});

// MetricsCollector.test.ts
describe('MetricsCollector', () => {
  it('should emit metrics periodically', (done) => {
    stateManager.on(StateEvent.METRICS_UPDATED, (data) => {
      expect(data.metrics).toBeDefined();
      done();
    });
    collector.start();
  });
});

// UIClientHook.test.ts
describe('UIClientHook', () => {
  it('should relay state events to UI clients', (done) => {
    hook.on('state_update', (update) => {
      expect(update.event).toBe(StateEvent.TASK_CREATED);
      done();
    });
    stateManager.emitTaskCreated(mockTask);
  });
});
```

## Conclusion

Ces préparations créent une **foundation solide** sans casser l'existant. Quand tu seras prêt à implémenter le frontend/backend, tu pourras :

1. Créer UIConnectionManager qui écoute UIClientHook
2. Brancher sur les events déjà émis
3. Utiliser getStateSnapshot() pour l'état initial
4. Implémenter les commandes définies dans types.ts

Tout sera **plug-and-play** ! 🚀
