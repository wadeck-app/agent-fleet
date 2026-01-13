# Plan: Real-time Logs + Chunked Storage

**Timestamp**: 2026-01-03_15-55
**Status**: Design Phase

## Objectifs

### 1. Logs en temps réel (500ms)

- Worker envoie le trace partiel toutes les 500ms pendant l'exécution
- Orchestrator met à jour progressivement `task.flowResult.trace`
- Frontend reçoit les mises à jour en temps réel via WebSocket

### 2. Stockage par chunks

- Les logs sont écrits dans des fichiers séparés (chunks de 100 entries)
- Pagination efficace: 1 requête = 1 fichier si taille = chunk size
- Structure: `data/tasks/{taskId}/trace-chunk-{N}.json`

---

## Architecture

### Vue d'ensemble

```
┌─────────────┐      TASK_TRACE_UPDATE (500ms)      ┌──────────────┐
│   Worker    │──────────────────────────────────────>│ Orchestrator │
│             │        { taskId, trace }             │              │
└─────────────┘                                      └──────┬───────┘
                                                            │
                                                            │ Write chunks
                                                            │ + Update task
                                                            ▼
                                                    ┌──────────────────┐
                                                    │  ChunkStorage    │
                                                    │  ├─ chunk-0.json │
                                                    │  ├─ chunk-1.json │
                                                    │  └─ chunk-N.json │
                                                    └────────┬─────────┘
                                                            │
                                                            │ Read chunks
                                                            ▼
┌─────────────┐      GET /api/tasks/:id/logs        ┌──────────────┐
│  Frontend   │<─────────────────────────────────────│   Backend    │
│             │      { logs, nextCursor }            │              │
└─────────────┘                                      └──────────────┘
       ▲
       │ B2F_TASK_UPDATED (real-time)
       │
       └──────────────────────────────────────────────────┘
```

---

## Partie 1: Logs en temps réel (500ms)

### 1.1 Worker: Envoi périodique du trace

**Fichier**: `packages/worker/src/flow/FlowWorker.ts`

#### Modifications nécessaires:

```typescript
export class FlowWorker implements Shutdownable {
	// ... existing fields ...

	// NEW: Timer for periodic trace updates
	private traceUpdateTimer: NodeJS.Timeout | null = null;
	private readonly TRACE_UPDATE_INTERVAL = 500; // 500ms

	/**
	 * Start periodic trace updates
	 */
	private startTraceUpdates(): void {
		if (this.traceUpdateTimer) {
			clearInterval(this.traceUpdateTimer);
		}

		this.traceUpdateTimer = setInterval(() => {
			if (this.currentTask?.flowResult?.trace) {
				this.sendTraceUpdate(this.currentTask.flowResult.trace);
			}
		}, this.TRACE_UPDATE_INTERVAL);
	}

	/**
	 * Stop periodic trace updates
	 */
	private stopTraceUpdates(): void {
		if (this.traceUpdateTimer) {
			clearInterval(this.traceUpdateTimer);
			this.traceUpdateTimer = null;
		}
	}

	/**
	 * Send trace update to orchestrator
	 */
	private sendTraceUpdate(trace: FlowTrace): void {
		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_TRACE_UPDATE, {
				workerId: this.workerId,
				taskId: this.currentTask!.id,
				trace: trace,
			})
		);
	}

	// MODIFY: executeTask method
	private async executeTask(task: Task): Promise<void> {
		// ... existing code ...

		try {
			// Start trace updates BEFORE execution
			this.startTraceUpdates();

			// Execute the flow
			const result = await this.flowExecutor.execute(executionOptions);

			// Stop trace updates AFTER execution
			this.stopTraceUpdates();

			// Store result in task
			task.flowResult = {
				status: result.success ? 'completed' : 'failed',
				outputs: result.outputs,
				error: result.error,
				trace: result.trace,
			};

			// Send final completion with full trace
			if (result.success) {
				this.sendTaskCompleted(
					{
						message: 'Flow execution completed',
						outputs: result.outputs,
						trace: result.trace,
					},
					successStatus
				);
			} else {
				this.sendTaskFailed(result.error || 'Flow execution failed', failureStatus);
			}
		} catch (error) {
			// Stop trace updates on error
			this.stopTraceUpdates();
			// ... existing error handling ...
		}
	}
}
```

### 1.2 Nouveau message W2O: TASK_TRACE_UPDATE

**Fichier**: `packages/shared-orch-worker/src/worker-messages.ts`

```typescript
export enum W2OMessageType {
	// ... existing types ...
	TASK_TRACE_UPDATE = 'w2o:task:trace_update', // NEW
}

export interface W2OTaskTraceUpdateMessage extends W2OBaseMessage {
	type: W2OMessageType.TASK_TRACE_UPDATE;
	workerId: string;
	taskId: string;
	trace: any; // FlowTrace from flow-engine
}

export type W2OMessage =
	| W2OWorkerReadyMessage
	| W2OWorkerHeartbeatMessage
	| W2OTaskStartedMessage
	| W2OTaskProgressMessage
	| W2OTaskCompletedMessage
	| W2OTaskFailedMessage
	| W2OTaskTraceUpdateMessage; // NEW
// ... other types ...
```

### 1.3 Orchestrator: Gestion des mises à jour de trace

**Fichier**: `packages/orchestrator/src/websocket/WebSocketEventHandler.ts`

```typescript
export class WebSocketEventHandler {
	// ... existing methods ...

	/**
	 * Handle TASK_TRACE_UPDATE message (real-time trace updates)
	 */
	async handleTaskTraceUpdate(message: W2OTaskTraceUpdateMessage): Promise<void> {
		const { workerId, taskId, trace } = message;
		logger.debug(`[WS] Worker ${workerId} sent trace update for task ${taskId}`);

		const task = this.taskManager.getTask(taskId);
		if (!task) {
			logger.warn(`[WS] Task ${taskId} not found for trace update`);
			return;
		}

		// Update task with partial trace (in-memory only for performance)
		task.flowResult = {
			status: 'running', // Still running
			trace: trace,
		};

		// Emit event for real-time frontend updates
		this.stateManager.emitTaskUpdated(task);
	}
}
```

**Fichier**: `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts`

```typescript
async routeMessage(socket: WebSocket, message: W2OMessage, workerId: string | null): Promise<string | void> {
    // ... existing routing ...

    switch (message.type) {
        // ... existing cases ...

        case W2OMessageType.TASK_TRACE_UPDATE:
            await this.eventHandler.handleTaskTraceUpdate(message);
            break;

        // ... rest of cases ...
    }
}
```

---

## Partie 2: Stockage par chunks

### 2.1 Structure de stockage

```
data/tasks/{taskId}/
├── task.json              # Task metadata (sans trace)
└── trace/
    ├── chunk-0.json      # Entries 0-99
    ├── chunk-1.json      # Entries 100-199
    ├── chunk-2.json      # Entries 200-299
    └── metadata.json     # Chunk index + total count
```

**metadata.json**:

```json
{
	"totalEntries": 523,
	"chunkSize": 100,
	"totalChunks": 6,
	"lastUpdated": "2026-01-03T15:55:00.000Z",
	"chunks": [
		{ "index": 0, "start": 0, "end": 99, "count": 100 },
		{ "index": 1, "start": 100, "end": 199, "count": 100 },
		{ "index": 2, "start": 200, "end": 299, "count": 100 },
		{ "index": 3, "start": 300, "end": 399, "count": 100 },
		{ "index": 4, "start": 400, "end": 499, "count": 100 },
		{ "index": 5, "start": 500, "end": 522, "count": 23 }
	]
}
```

### 2.2 Nouveau service: TraceChunkStorage

**Fichier**: `packages/orchestrator/src/core/TraceChunkStorage.ts`

```typescript
import type { FlowTrace, StepTrace } from 'flow-engine/types';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface ChunkMetadata {
	index: number;
	start: number;
	end: number;
	count: number;
}

export interface TraceMetadata {
	totalEntries: number;
	chunkSize: number;
	totalChunks: number;
	lastUpdated: string;
	chunks: ChunkMetadata[];
}

export interface TraceChunk {
	chunkIndex: number;
	entries: StepTrace[];
}

export class TraceChunkStorage {
	private readonly CHUNK_SIZE = 100;
	private readonly baseDir: string;

	constructor(baseDir: string = './data/tasks') {
		this.baseDir = baseDir;
	}

	/**
	 * Get trace directory for a task
	 */
	private getTraceDir(taskId: string): string {
		return join(this.baseDir, taskId, 'trace');
	}

	/**
	 * Get chunk file path
	 */
	private getChunkPath(taskId: string, chunkIndex: number): string {
		return join(this.getTraceDir(taskId), `chunk-${chunkIndex}.json`);
	}

	/**
	 * Get metadata file path
	 */
	private getMetadataPath(taskId: string): string {
		return join(this.getTraceDir(taskId), 'metadata.json');
	}

	/**
	 * Write trace incrementally (called by handleTaskTraceUpdate)
	 * Appends new entries to chunks
	 */
	async writeTraceIncremental(taskId: string, trace: FlowTrace): Promise<void> {
		const traceDir = this.getTraceDir(taskId);
		await fs.mkdir(traceDir, { recursive: true });

		const steps = trace.steps || [];

		// Load existing metadata or create new
		let metadata = await this.loadMetadata(taskId);

		// Determine which entries are new
		const existingCount = metadata?.totalEntries || 0;
		const newSteps = steps.slice(existingCount);

		if (newSteps.length === 0) {
			return; // No new entries
		}

		// Calculate chunks for new steps
		const startIndex = existingCount;
		let currentChunkIndex = Math.floor(startIndex / this.CHUNK_SIZE);
		let currentChunkEntries: StepTrace[] = [];

		// Load partial chunk if exists
		if (existingCount % this.CHUNK_SIZE !== 0) {
			const existingChunk = await this.loadChunk(taskId, currentChunkIndex);
			currentChunkEntries = existingChunk?.entries || [];
		}

		for (let i = 0; i < newSteps.length; i++) {
			currentChunkEntries.push(newSteps[i]);

			// Chunk is full or last entry
			if (currentChunkEntries.length === this.CHUNK_SIZE || i === newSteps.length - 1) {
				await this.writeChunk(taskId, currentChunkIndex, currentChunkEntries);

				currentChunkIndex++;
				currentChunkEntries = [];
			}
		}

		// Update metadata
		await this.updateMetadata(taskId, steps.length);
	}

	/**
	 * Write a complete trace (called by handleTaskCompleted)
	 */
	async writeTraceFull(taskId: string, trace: FlowTrace): Promise<void> {
		const traceDir = this.getTraceDir(taskId);
		await fs.mkdir(traceDir, { recursive: true });

		const steps = trace.steps || [];

		// Write all chunks
		const totalChunks = Math.ceil(steps.length / this.CHUNK_SIZE);
		for (let i = 0; i < totalChunks; i++) {
			const start = i * this.CHUNK_SIZE;
			const end = Math.min(start + this.CHUNK_SIZE, steps.length);
			const chunkSteps = steps.slice(start, end);

			await this.writeChunk(taskId, i, chunkSteps);
		}

		// Write metadata
		await this.updateMetadata(taskId, steps.length);
	}

	/**
	 * Write a single chunk
	 */
	private async writeChunk(taskId: string, chunkIndex: number, steps: StepTrace[]): Promise<void> {
		const chunkPath = this.getChunkPath(taskId, chunkIndex);
		const chunk: TraceChunk = {
			chunkIndex,
			entries: steps,
		};

		await fs.writeFile(chunkPath, JSON.stringify(chunk, null, 2), 'utf-8');
	}

	/**
	 * Load a single chunk
	 */
	async loadChunk(taskId: string, chunkIndex: number): Promise<TraceChunk | null> {
		const chunkPath = this.getChunkPath(taskId, chunkIndex);

		try {
			const content = await fs.readFile(chunkPath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
			return null;
		}
	}

	/**
	 * Load metadata
	 */
	async loadMetadata(taskId: string): Promise<TraceMetadata | null> {
		const metadataPath = this.getMetadataPath(taskId);

		try {
			const content = await fs.readFile(metadataPath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
			return null;
		}
	}

	/**
	 * Update metadata
	 */
	private async updateMetadata(taskId: string, totalEntries: number): Promise<void> {
		const metadataPath = this.getMetadataPath(taskId);

		const totalChunks = Math.ceil(totalEntries / this.CHUNK_SIZE);
		const chunks: ChunkMetadata[] = [];

		for (let i = 0; i < totalChunks; i++) {
			const start = i * this.CHUNK_SIZE;
			const end = Math.min(start + this.CHUNK_SIZE, totalEntries) - 1;
			const count = end - start + 1;

			chunks.push({
				index: i,
				start,
				end,
				count,
			});
		}

		const metadata: TraceMetadata = {
			totalEntries,
			chunkSize: this.CHUNK_SIZE,
			totalChunks,
			lastUpdated: new Date().toISOString(),
			chunks,
		};

		await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
	}

	/**
	 * Read logs with pagination (optimized for chunk-aligned requests)
	 */
	async readLogsPaginated(
		taskId: string,
		cursor: number = 0,
		limit: number = 100
	): Promise<{ logs: StepTrace[]; nextCursor: number | null; total: number }> {
		const metadata = await this.loadMetadata(taskId);

		if (!metadata) {
			return { logs: [], nextCursor: null, total: 0 };
		}

		const total = metadata.totalEntries;

		// OPTIMIZATION: If requesting exact chunk size at chunk boundary
		if (limit === this.CHUNK_SIZE && cursor % this.CHUNK_SIZE === 0) {
			const chunkIndex = Math.floor(cursor / this.CHUNK_SIZE);
			const chunk = await this.loadChunk(taskId, chunkIndex);

			if (chunk) {
				const nextCursor = cursor + chunk.entries.length < total ? cursor + chunk.entries.length : null;

				return {
					logs: chunk.entries,
					nextCursor,
					total,
				};
			}
		}

		// General case: may span multiple chunks
		const startChunk = Math.floor(cursor / this.CHUNK_SIZE);
		const endChunk = Math.floor((cursor + limit - 1) / this.CHUNK_SIZE);

		let logs: StepTrace[] = [];

		for (let i = startChunk; i <= endChunk; i++) {
			const chunk = await this.loadChunk(taskId, i);
			if (chunk) {
				logs = logs.concat(chunk.entries);
			}
		}

		// Slice to exact range
		const startOffset = cursor % this.CHUNK_SIZE;
		const slicedLogs = logs.slice(startOffset, startOffset + limit);

		const nextCursor = cursor + slicedLogs.length < total ? cursor + slicedLogs.length : null;

		return {
			logs: slicedLogs,
			nextCursor,
			total,
		};
	}

	/**
	 * Delete all trace chunks for a task
	 */
	async deleteTrace(taskId: string): Promise<void> {
		const traceDir = this.getTraceDir(taskId);

		try {
			await fs.rm(traceDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore if doesn't exist
		}
	}
}
```

### 2.3 Intégration avec WebSocketEventHandler

**Fichier**: `packages/orchestrator/src/websocket/WebSocketEventHandler.ts`

```typescript
export class WebSocketEventHandler {
	private taskManager: TaskManager;
	private stateManager: StateManager;
	private connectionManager: WebSocketConnectionManager;
	private interventionManager: InterventionManager;
	private traceStorage: TraceChunkStorage; // NEW

	constructor(
		taskManager: TaskManager,
		stateManager: StateManager,
		connectionManager: WebSocketConnectionManager,
		interventionManager: InterventionManager,
		traceStorage: TraceChunkStorage // NEW
	) {
		this.taskManager = taskManager;
		this.stateManager = stateManager;
		this.connectionManager = connectionManager;
		this.interventionManager = interventionManager;
		this.traceStorage = traceStorage; // NEW
	}

	/**
	 * Handle TASK_TRACE_UPDATE message (real-time trace updates)
	 */
	async handleTaskTraceUpdate(message: W2OTaskTraceUpdateMessage): Promise<void> {
		const { workerId, taskId, trace } = message;
		logger.debug(
			`[WS] Worker ${workerId} sent trace update for task ${taskId} (${trace.steps?.length || 0} steps)`
		);

		// Write trace incrementally to chunks
		try {
			await this.traceStorage.writeTraceIncremental(taskId, trace);
		} catch (error) {
			logger.error(`[WS] Failed to write trace chunks for task ${taskId}:`, error);
		}

		// Update task in-memory (without full trace for performance)
		const task = this.taskManager.getTask(taskId);
		if (task) {
			task.flowResult = {
				status: 'running',
				// Don't store full trace in memory, just metadata
				trace: {
					id: trace.id,
					taskId: trace.taskId,
					flowId: trace.flowId,
					workspaceId: trace.workspaceId,
					startTime: trace.startTime,
					status: trace.status,
					steps: [], // Empty - stored in chunks
				},
			};

			// Emit event for real-time frontend updates
			this.stateManager.emitTaskUpdated(task);
		}
	}

	/**
	 * Handle TASK_COMPLETED message (with full trace storage)
	 */
	async handleTaskCompleted(message: W2OTaskCompletedMessage): Promise<void> {
		const { workerId, taskId, result, newStatus } = message;
		logger.info(`[WS] Worker ${workerId} completed task ${taskId}`);

		// Write final trace to chunks
		if (result?.trace) {
			try {
				await this.traceStorage.writeTraceFull(taskId, result.trace);
			} catch (error) {
				logger.error(`[WS] Failed to write final trace for task ${taskId}:`, error);
			}
		}

		// Update task with flowResult (without storing full trace in task.json)
		const task = this.taskManager.getTask(taskId);
		if (task && result) {
			task.flowResult = {
				status: 'completed',
				outputs: result.outputs || {},
				// Store only trace metadata in task.json
				trace: result.trace
					? {
							id: result.trace.id,
							taskId: result.trace.taskId,
							flowId: result.trace.flowId,
							workspaceId: result.trace.workspaceId,
							startTime: result.trace.startTime,
							endTime: result.trace.endTime,
							status: result.trace.status,
							steps: [], // Empty - stored in chunks
						}
					: undefined,
			};

			try {
				await this.taskManager.updateTask(task);
			} catch (error) {
				logger.error(`[WS] Failed to update task ${taskId} flowResult:`, error);
			}
		}

		const status = newStatus || TaskStatus.REVIEW;
		this.taskManager.updateTaskStatus(taskId, status, {
			event: 'completed',
			workerId,
			result,
		});

		// Release the worker
		this.connectionManager.releaseWorker(workerId);
	}
}
```

### 2.4 Backend: Utilisation du chunk storage

**Fichier**: `packages/web-backend/src/services/TasksService.ts`

Modifier `getTaskLogs()`:

```typescript
/**
 * Get paginated logs for a task (using chunk storage)
 */
async getTaskLogs(taskId: string, query: PaginatedLogsQuery): Promise<PaginatedLogsResponse> {
    try {
        console.log(
            `[TasksService] Fetching logs for task ${taskId}, cursor=${query.cursor}, limit=${query.limit}`
        );

        // Get full task to check status
        const task = await this.getTaskById(taskId);

        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        // Check if task is still running
        const isRunning = task.status === 'in_progress' || task.status === 'testing';

        // Use TraceChunkStorage to read logs efficiently
        const traceStorage = new TraceChunkStorage('./data/tasks');
        const { logs: steps, nextCursor, total } = await traceStorage.readLogsPaginated(
            taskId,
            query.cursor || 0,
            query.limit || 100
        );

        // Convert steps to log entries (existing logic)
        let allLogs: LogEntry[] = [];
        steps.forEach((step: any) => {
            // Main step entry
            const stepLog: LogEntry = {
                id: `${step.stepId}-main`,
                timestamp: step.startTime,
                level: this.inferLogLevel(step),
                message: this.formatStepMessage(step),
                stepId: step.stepId,
                stepName: step.stepName,
                stepType: step.stepType,
                metadata: {
                    durationMs: step.durationMs,
                    model: step.model,
                    exitCode: step.exitCode,
                },
            };
            allLogs.push(stepLog);

            // Add detailed logs (prompt, response, etc.)
            // ... existing logic ...
        });

        // Apply filters
        if (query.level) {
            allLogs = allLogs.filter(log => log.level === query.level);
        }

        if (query.search) {
            const searchLower = query.search.toLowerCase();
            allLogs = allLogs.filter(log => log.message.toLowerCase().includes(searchLower));
        }

        return {
            logs: allLogs,
            nextCursor,
            total,
            isRunning,
        };
    } catch (error) {
        console.error(`[TasksService] Failed to fetch logs for task ${taskId}:`, error);
        throw error;
    }
}
```

---

## Séquence d'exécution

### Phase 1: Démarrage de tâche

```
1. Worker reçoit ASSIGN_TASK
2. Worker démarre l'exécution
3. Worker lance le timer (500ms) pour TASK_TRACE_UPDATE
4. Orchestrator reçoit TASK_TRACE_UPDATE #1
   └─> TraceChunkStorage.writeTraceIncremental()
   └─> Écrit chunk-0.json (partiel)
   └─> Émet B2F_TASK_UPDATED
5. Frontend reçoit mise à jour → affiche logs en temps réel
```

### Phase 2: Pendant l'exécution (toutes les 500ms)

```
6. Worker envoie TASK_TRACE_UPDATE #2, #3, #4...
7. Orchestrator append au chunk actuel
   ├─> Si chunk plein (100 entries) → crée chunk-1.json
   └─> Met à jour metadata.json
8. Frontend reçoit mises à jour continues
```

### Phase 3: Fin de tâche

```
9. Worker arrête le timer
10. Worker envoie TASK_COMPLETED avec trace final
11. Orchestrator écrit les derniers chunks
    └─> TraceChunkStorage.writeTraceFull() (pour garantir cohérence)
12. Met à jour task.json (sans trace complète)
13. Émet B2F_TASK_UPDATED final
```

### Phase 4: Consultation des logs

```
14. Frontend appelle GET /api/tasks/:id/logs?cursor=0&limit=100
15. Backend appelle TraceChunkStorage.readLogsPaginated(0, 100)
16. Si cursor=0 et limit=100 → retourne directement chunk-0.json
17. Sinon → charge les chunks nécessaires et slice
```

---

## Performance

### Avantages du chunking

1. **Pagination efficace**:
    - Requête alignée (cursor=0, limit=100) → 1 lecture fichier
    - Requête non-alignée → max 2-3 lectures fichiers

2. **Mémoire**:
    - Task.json ne contient plus le trace complet
    - Orchestrator ne garde pas 10K+ logs en mémoire

3. **Scalabilité**:
    - Tasks avec 100K logs → 1000 chunks de 100 KB chacun
    - Lecture partielle possible sans charger tout

4. **Real-time**:
    - Mises à jour toutes les 500ms
    - Écriture append-only (rapide)

### Métriques cibles

| Opération                  | Cible       | Actuel (sans chunking) |
| -------------------------- | ----------- | ---------------------- |
| Écriture trace update      | < 10ms      | N/A                    |
| Lecture 100 logs (aligned) | < 5ms       | < 50ms                 |
| Lecture 100 logs (random)  | < 20ms      | < 100ms                |
| Mémoire orchestrator       | < 10MB/task | ~50-100MB/task         |
| Latence real-time          | < 500ms     | N/A                    |

---

## Ordre d'implémentation

### Phase 1: Real-time updates (Priority 1)

1. ✅ Ajouter W2OMessageType.TASK_TRACE_UPDATE
2. ✅ Worker: timer + sendTraceUpdate()
3. ✅ Orchestrator: handleTaskTraceUpdate()
4. ✅ Router: case TASK_TRACE_UPDATE
5. ✅ Test: vérifier que frontend reçoit mises à jour

### Phase 2: Chunk storage (Priority 2)

1. ✅ Créer TraceChunkStorage.ts
2. ✅ Implémenter writeTraceIncremental()
3. ✅ Implémenter writeTraceFull()
4. ✅ Implémenter readLogsPaginated()
5. ✅ Intégrer dans WebSocketEventHandler
6. ✅ Modifier TasksService.getTaskLogs()
7. ✅ Test: vérifier pagination efficace

### Phase 3: Cleanup (Priority 3)

1. ✅ Supprimer anciens traces du task.json
2. ✅ Migration script pour tâches existantes
3. ✅ Garbage collection des vieux chunks

---

## Tests

### Test 1: Real-time updates

```typescript
test('Worker sends trace updates every 500ms', async () => {
	const worker = new FlowWorker(/* ... */);
	const updates: any[] = [];

	orchestrator.on('task:trace_update', data => {
		updates.push(data);
	});

	await worker.executeTask(task);

	// Should have received multiple updates
	expect(updates.length).toBeGreaterThan(3);

	// Updates should be ~500ms apart
	for (let i = 1; i < updates.length; i++) {
		const delta = updates[i].timestamp - updates[i - 1].timestamp;
		expect(delta).toBeGreaterThanOrEqual(450);
		expect(delta).toBeLessThanOrEqual(600);
	}
});
```

### Test 2: Chunk storage efficiency

```typescript
test('Aligned pagination reads single chunk', async () => {
	const storage = new TraceChunkStorage();

	// Write 300 logs (3 chunks)
	await storage.writeTraceFull(taskId, {
		steps: Array(300).fill(mockStep),
	});

	// Read chunk 1 (aligned)
	const start = Date.now();
	const result = await storage.readLogsPaginated(taskId, 100, 100);
	const duration = Date.now() - start;

	expect(result.logs.length).toBe(100);
	expect(duration).toBeLessThan(10); // Should be very fast
});
```

### Test 3: Incremental writing

```typescript
test('Incremental writes create correct chunks', async () => {
	const storage = new TraceChunkStorage();

	// Write in increments
	await storage.writeTraceIncremental(taskId, { steps: Array(50).fill(mockStep) });
	await storage.writeTraceIncremental(taskId, { steps: Array(80).fill(mockStep) });
	await storage.writeTraceIncremental(taskId, { steps: Array(120).fill(mockStep) });

	// Should have created 2 full chunks + 1 partial
	const metadata = await storage.loadMetadata(taskId);
	expect(metadata.totalChunks).toBe(3);
	expect(metadata.chunks[0].count).toBe(100);
	expect(metadata.chunks[1].count).toBe(100);
	expect(metadata.chunks[2].count).toBe(50);
});
```

---

## Fichiers à créer/modifier

### Nouveaux fichiers

- ✅ `packages/orchestrator/src/core/TraceChunkStorage.ts`
- ✅ `packages/orchestrator/src/core/TraceChunkStorage.test.ts`

### Fichiers à modifier

- ✅ `packages/shared-orch-worker/src/worker-messages.ts` (W2OMessageType + interface)
- ✅ `packages/worker/src/flow/FlowWorker.ts` (timer + sendTraceUpdate)
- ✅ `packages/orchestrator/src/websocket/WebSocketEventHandler.ts` (handleTaskTraceUpdate)
- ✅ `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts` (route message)
- ✅ `packages/web-backend/src/services/TasksService.ts` (use chunk storage)
- ✅ `packages/orchestrator/src/core/TaskManager.ts` (don't store full trace)

---

## Migration

Pour les tâches existantes avec trace dans task.json:

```typescript
async function migrateTaskTracesToChunks() {
	const storage = new TraceChunkStorage();
	const tasks = await Storage.listTasks();

	for (const task of tasks) {
		if (task.flowResult?.trace?.steps?.length > 0) {
			// Write to chunks
			await storage.writeTraceFull(task.id, task.flowResult.trace);

			// Clear trace from task
			task.flowResult.trace.steps = [];
			await Storage.saveTask(task);
		}
	}
}
```

---

## Questions ouvertes

1. **Nettoyage**: Quand supprimer les chunks? Après X jours? Ou jamais (archives)?
2. **Compression**: Compresser les chunks (gzip) pour économiser espace?
3. **Limite**: Nombre max de logs par tâche? (ex: 100K = 1000 chunks)
4. **Throttling**: Limiter la fréquence des TASK_TRACE_UPDATE si trop de logs?
