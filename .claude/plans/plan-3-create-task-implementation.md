# Plan 3 : Implémentation Création de Tâches (Backend → Orchestrator → Worker)

## Scope

**Uniquement** : Implémentation de la création de tâches depuis le backend

**Prérequis** :

- ✅ Plan 1 (F↔B events) complété
- ✅ Plan 2 (O↔W messages) complété
- ✅ Autre agent a complété O↔B events

**Flow complet** :

```
Frontend → POST /api/tasks → Backend → Orchestrator → Worker
Worker → Orchestrator (events) → Backend → Frontend (WebSocket)
```

---

## Phases d'Implémentation

### Phase 1 : Extension CreateTaskSchema

**Fichier** : `packages/shared-frontend-backend/src/api/tasks.contract.ts`

**Modification** (lignes 88-94) :

```typescript
export const CreateTaskSchema = z.object({
	description: z.string().min(1, 'Description requise'),
	priority: TaskPrioritySchema.optional().default('medium'),

	// Champs pour l'exécution de flows
	flowId: z.string().optional(),
	flowInputs: z.record(z.string(), z.unknown()).optional(),

	// Métadonnées additionnelles
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;
```

**Raison** : Supporte la création de tâches simples ET avec flows

---

### Phase 2 : TasksService.createTask()

**Fichier** : `packages/web-backend/src/services/TasksService.ts`

**Modification 1** : Constructeur (lignes 40-43)

```typescript
constructor(
  private readonly orchestratorRepository: OrchestratorRepository,
  private readonly eventBroadcaster: EventBroadcaster,
  private readonly orchestratorClient: OrchestratorClient  // NOUVEAU
) {}
```

**Modification 2** : Nouvelle méthode (après ligne 93)

```typescript
/**
 * Créer une nouvelle tâche via OrchestratorClient
 *
 * Flow :
 * 1. Préparer metadata avec flowId/flowInputs
 * 2. Appeler OrchestratorClient.createTask()
 * 3. L'orchestrateur crée la tâche et émet o2b:task:created
 * 4. Notre abonnement O2B transmettra l'événement au frontend via b2f:task:created
 *
 * NOTE : Ne PAS émettre d'événement ici car l'orchestrateur émettra
 * automatiquement un événement O2B que notre handler transmettra.
 */
async createTask(input: CreateTask): Promise<Task> {
  try {
    // Préparer les métadonnées
    const metadata: Record<string, unknown> = {
      ...(input.metadata || {}),
      priority: input.priority || 'medium',
    };

    // Ajouter flowId et flowInputs si présents
    if (input.flowId) {
      metadata.flowId = input.flowId;
    }
    if (input.flowInputs) {
      metadata.flowInputs = input.flowInputs;
    }

    // Appeler l'orchestrateur via OrchestratorClient
    const task = await this.orchestratorClient.createTask(
      input.description,
      metadata
    );

    console.log(`[TasksService] Tâche créée : ${task.id}`);

    // NOTE : Ne PAS émettre b2f:task:created ici !
    // L'orchestrateur émettra o2b:task:created
    // Notre subscribeToOrchestratorEvents transmettra vers b2f:task:created

    return task;
  } catch (error) {
    console.error('[TasksService] Échec de création de tâche:', error);
    throw error;
  }
}
```

---

### Phase 3 : Injection OrchestratorClient

**Fichier** : `packages/web-backend/src/factories/DataStoreFactory.ts`

**Modification** : getTasksService() (lignes 148-166)

```typescript
getTasksService(): TasksService {
  if (!this.tasksService) {
    const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:3737';
    const cacheTtlMs = 5000;
    const orchestratorRepo = new OrchestratorRepository(orchestratorUrl, cacheTtlMs);
    const eventBroadcaster = this.getEventBroadcaster();
    const orchestratorClient = this.orchestratorClient;  // NOUVEAU

    this.tasksService = new TasksService(
      orchestratorRepo,
      eventBroadcaster,
      orchestratorClient  // NOUVEAU paramètre
    );
  }

  return this.tasksService;
}
```

---

### Phase 4 : Route POST /api/tasks

**Fichier** : `packages/web-backend/src/controllers/TasksController.ts`

**Modification** : Après la route GET (après ligne 39)

```typescript
/**
 * POST /api/tasks/
 * Créer une nouvelle tâche
 * Body: CreateTask (description, priority, flowId?, flowInputs?, metadata?)
 */
add('POST', '/api/tasks/', async ({ body }) => {
	return this.service.createTask(body);
});
```

**Note** : Validation Zod automatique via le contrat tasks.contract.ts

---

### Phase 5 : Abonnement O2B Events

**Fichier** : `packages/web-backend/src/server.ts`

**Modification** : Nouvelle fonction après initializeOrchestratorClient (après ligne 88)

```typescript
/**
 * S'abonner aux événements O2B et les transmettre au frontend en B2F
 *
 * Flow : o2b:task:created → transforme → b2f:task:created → frontend
 *
 * IMPORTANT : Utiliser les constantes O2B_TASK_CREATED, B2F_TASK_CREATED
 * après migration des événements
 */
function subscribeToOrchestratorEvents(
	orchestratorClient: OrchestratorClient,
	eventBroadcaster: EventBroadcaster
): void {
	console.log('[Server] Abonnement aux événements O2B');

	// Task events
	orchestratorClient.on('o2b:task:created', data => {
		console.log(`[O2B] o2b:task:created: ${data.taskId}`);
		eventBroadcaster.broadcast('b2f:task:created', data.task);
	});

	orchestratorClient.on('o2b:task:updated', data => {
		console.log(`[O2B] o2b:task:updated: ${data.taskId}`);
		eventBroadcaster.broadcast('b2f:task:updated', data.task);
	});

	orchestratorClient.on('o2b:task:completed', data => {
		console.log(`[O2B] o2b:task:completed: ${data.taskId}`);
		eventBroadcaster.broadcast('b2f:task:completed', {
			taskId: data.taskId,
			workerId: data.workerId,
			completedAt: Date.now(),
		});
	});

	orchestratorClient.on('o2b:task:failed', data => {
		console.log(`[O2B] o2b:task:failed: ${data.taskId}`);
		eventBroadcaster.broadcast('b2f:task:failed', {
			id: data.taskId,
			error: data.error,
		});
	});

	// Worker events
	orchestratorClient.on('o2b:worker:connected', data => {
		console.log(`[O2B] o2b:worker:connected: ${data.workerId}`);
		eventBroadcaster.broadcast('b2f:worker:connected', {
			workerId: data.workerId,
			workerType: data.workerType,
			timestamp: data.timestamp,
		});
	});

	orchestratorClient.on('o2b:worker:disconnected', data => {
		console.log(`[O2B] o2b:worker:disconnected: ${data.workerId}`);
		eventBroadcaster.broadcast('b2f:worker:disconnected', {
			workerId: data.workerId,
			reason: data.reason || 'Unknown',
			timestamp: data.timestamp,
		});
	});

	orchestratorClient.on('o2b:worker:status', data => {
		console.log(`[O2B] o2b:worker:status: ${data.workerId}`);
		eventBroadcaster.broadcast('b2f:worker:status', {
			workerId: data.workerId,
			status: data.status,
			taskId: data.taskId || null,
		});
	});
}
```

**Appel** : Dans start(), après initializeTransportServer (ligne 414)

```typescript
// S'abonner aux événements O2B et transmettre en B2F
subscribeToOrchestratorEvents(orchestratorClient, factory.getEventBroadcaster());
```

---

## Fichiers à Modifier

### Shared

1. `packages/shared-frontend-backend/src/api/tasks.contract.ts` - CreateTaskSchema

### Backend

2. `packages/web-backend/src/services/TasksService.ts` - Constructor + createTask()
3. `packages/web-backend/src/factories/DataStoreFactory.ts` - Injection DI
4. `packages/web-backend/src/controllers/TasksController.ts` - Route POST
5. `packages/web-backend/src/server.ts` - subscribeToOrchestratorEvents()

**Total** : 5 fichiers

---

## Tests à Ajouter

### Tests Unitaires

**Nouveau fichier** : `packages/web-backend/src/services/TasksService.test.ts`

**Cas de test** :

1. createTask() - tâche simple
2. createTask() - tâche avec flow (flowId + flowInputs)
3. createTask() - erreur propagée

### Tests d'Intégration

**Fichier** : `packages/web-backend/src/controllers/TasksController.test.ts`

**Cas de test** :

1. POST /api/tasks - succès
2. POST /api/tasks - erreur validation (description vide)
3. POST /api/tasks - avec flowId et flowInputs

---

## Flow Complet de Données

```
1. Frontend/CLI
   ↓ POST /api/tasks { description, flowId, flowInputs }

2. Backend (TasksController)
   ↓ Validation Zod automatique

3. Backend (TasksService.createTask)
   ↓ Prépare metadata = { ...metadata, flowId, flowInputs, priority }
   ↓ Appelle orchestratorClient.createTask(description, metadata)

4. Orchestrator (TaskManager.createTask)
   ↓ Crée Task avec id, status=BACKLOG, metadata
   ↓ Ajoute au backlog global
   ↓ Émet o2b:task:created

5. Backend (subscribeToOrchestratorEvents)
   ↓ Reçoit o2b:task:created
   ↓ Transforme en b2f:task:created
   ↓ EventBroadcaster.broadcast('b2f:task:created', task)

6. Frontend
   ← Reçoit b2f:task:created via WebSocket

7. Worker (FlowWorker)
   → Envoie w2o:task:request
   ← Reçoit o2w:task:assign
   ↓ Exécute flow via FlowExecutor
   → Envoie w2o:task:started
   → Envoie w2o:task:progress (optionnel)
   → Envoie w2o:task:completed OU w2o:task:failed

8. Orchestrator
   ↓ Reçoit w2o:task:completed
   ↓ Met à jour task.status
   ↓ Émet o2b:task:completed

9. Backend (subscribeToOrchestratorEvents)
   ↓ Reçoit o2b:task:completed
   ↓ Transforme en b2f:task:completed

10. Frontend
    ← Reçoit b2f:task:completed via WebSocket
```

---

## Décisions Architecturales

### 1. Pas d'Émission Double

**Ne PAS émettre dans TasksService.createTask()** car :

- L'orchestrateur émet automatiquement o2b:task:created
- subscribeToOrchestratorEvents transmet déjà vers b2f:task:created
- Émission dans le service = événement en double au frontend

### 2. Metadata pour Flows

**Passer flowId/flowInputs via metadata** car :

- Signature TaskManager.createTask : `(description, metadata)`
- metadata est `Record<string, any>` - flexible
- TaskManager extrait flowId/flowInputs automatiquement
- Évite de modifier l'API TaskManager

### 3. Mapping O2B → B2F

**Transformation explicite dans subscribeToOrchestratorEvents** car :

- Préfixes clarifier la direction (o2b vs b2f)
- Mapping centralisé dans un seul endroit
- Permet transformation des données si besoin

---

## Estimation

**Phase 1** : 5 min
**Phase 2** : 20 min
**Phase 3** : 5 min
**Phase 4** : 5 min
**Phase 5** : 15 min
**Tests** : 30 min

**Total** : ~1h30

---

## Checklist de Validation

- [ ] CreateTaskSchema supporte flowId et flowInputs
- [ ] TasksService.createTask() implémentée
- [ ] OrchestratorClient injecté dans TasksService
- [ ] Route POST /api/tasks ajoutée
- [ ] subscribeToOrchestratorEvents() implémentée et appelée
- [ ] Tests unitaires TasksService passent
- [ ] Tests intégration TasksController passent
- [ ] Test E2E : POST /api/tasks → tâche créée → worker exécute → frontend notifié
- [ ] Build réussi (`npm run build`)
- [ ] Type checking OK (`npm run check`)

---

## Notes Importantes

1. **Dépendances** : Plans 1 et 2 doivent être complétés d'abord (événements renommés)
2. **O2B events** : Gérés par un autre agent - on suppose qu'ils utilisent déjà `o2b:` prefix
3. **Tests E2E** : Nécessite orchestrator + worker en cours d'exécution
4. **Fire-and-forget pour CLI** : La CLI peut faire POST puis exit, le suivi se fait côté serveur
