# Fix: Task Logs Missing in Frontend

**Timestamp**: 2026-01-03_15-27
**Issue**: Les logs des tâches ne s'affichent pas dans la vue frontend `tasks/:id/logs-stacked`

## Analyse du problème

### Flux actuel (CASSÉ)

1. **Worker** (FlowWorker.ts:936-941)
    - Exécute le flow via `flowExecutor.execute()`
    - Reçoit le résultat avec `result.trace` (contient tous les steps)
    - Stocke **localement** dans `task.flowResult = { status, outputs, error, trace }`

2. **Worker** (FlowWorker.ts:949-956)
    - Envoie message `TASK_COMPLETED` à l'orchestrator
    - Payload: `{ message, outputs, trace }` dans le champ `result`

3. **Orchestrator** (WebSocketEventHandler.ts:78-91)
    - Reçoit le message `TASK_COMPLETED`
    - Appelle `taskManager.updateTaskStatus(taskId, status, { event: 'completed', workerId, result })`
    - **NE MET JAMAIS À JOUR `task.flowResult`** ❌

4. **TaskManager** (TaskManager.ts:181-228)
    - `updateTaskStatus()` met à jour:
        - `task.status`
        - `task.updatedAt`
        - `task.history` (ajoute les details incluant le result)
    - **NE TOUCHE PAS `task.flowResult`** ❌

5. **Frontend**
    - Appelle `tasksApi.getTaskLogs(taskId)` → GET `/api/tasks/:id/logs`
    - Backend `TasksService.getTaskLogs()` lit `task.flowResult.trace.steps`
    - **`task.flowResult` est undefined ou ne contient pas de trace** ❌
    - Retourne une liste vide de logs

### Pourquoi c'est cassé

Le `flowResult` (incluant le trace) n'est stocké que dans la mémoire du Worker, jamais persisté côté Orchestrator. Quand le backend récupère la tâche depuis l'orchestrator, le champ `flowResult.trace` est vide/absent.

## Solution

### Option 1: Mettre à jour `task.flowResult` dans `handleTaskCompleted` (RECOMMANDÉ)

**Fichier**: `packages/orchestrator/src/websocket/WebSocketEventHandler.ts`

```typescript
handleTaskCompleted(message: W2OTaskCompletedMessage): void {
    const { workerId, taskId, result, newStatus } = message;
    logger.info(`[WS] Worker ${workerId} completed task ${taskId}`);

    const task = this.taskManager.getTask(taskId);
    if (!task) {
        logger.error(`[WS] Task ${taskId} not found when handling completion`);
        return;
    }

    // ✅ UPDATE: Store flowResult with trace from worker
    if (result) {
        task.flowResult = {
            status: 'completed',
            outputs: result.outputs || {},
            trace: result.trace, // Store the trace!
        };

        // Save task with flowResult
        await this.taskManager.updateTask(task);
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
```

**Même correction dans `handleTaskFailed`**:

```typescript
handleTaskFailed(message: W2OTaskFailedMessage): void {
    const { workerId, taskId, error, newStatus } = message;
    logger.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

    const task = this.taskManager.getTask(taskId);
    if (task) {
        // ✅ UPDATE: Store flowResult with error
        task.flowResult = {
            status: 'failed',
            error: error,
            // Note: trace might be in message.result if worker includes it on failure
        };

        await this.taskManager.updateTask(task);
    }

    // Use the provided status or default to BLOCKED
    const failureStatus = newStatus || TaskStatus.BLOCKED;

    this.taskManager.updateTaskStatus(taskId, failureStatus, {
        event: 'failed',
        workerId,
        error,
    });

    this.taskManager.addComment(taskId, 'system', `Task failed: ${error}`);

    // Release the worker
    const worker = this.connectionManager.getWorker(workerId);
    if (worker) {
        worker.taskId = null;
        this.stateManager.emitWorkerTaskReleased(workerId);
    }
}
```

### Changements nécessaires

1. **WebSocketEventHandler.ts**: Mettre à jour `handleTaskCompleted` et `handleTaskFailed` pour stocker `flowResult`
2. **Vérifier que TaskManager.updateTask() existe** et sauvegarde bien la tâche dans Storage
3. **Tester** qu'une tâche exécutée génère des logs visibles dans le frontend

## Tests à effectuer

1. Créer une tâche avec un flow qui génère des logs
2. Laisser le worker l'exécuter
3. Vérifier que `/api/tasks/:id/logs` retourne des logs
4. Vérifier que la vue frontend affiche les logs

## Impact

- **Fichiers modifiés**: 1 (WebSocketEventHandler.ts)
- **Breaking changes**: Non
- **Rétrocompatibilité**: Oui (les anciennes tâches sans trace continueront de fonctionner)
