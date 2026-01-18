# Plan: Architecture Backend-Centric avec Orchestrateur Léger

## Situation Actuelle

### Problèmes Identifiés

**1. Duplication de Responsabilités**

- Orchestrateur stocke tasks dans `./data/tasks/` avec leur propre schema (`shared-orch-worker`)
- Backend a un schema différent (`shared-frontend-backend`) et transforme les données
- Deux sources de vérité pour les mêmes données → incohérences possibles

**2. Duplication de Schémas et Transformations**

- `Task` défini deux fois avec champs différents
- Transformations manuelles error-prone: `assignedTo` → `assignedWorker` (TasksService:249)
- Backend ajoute `version`, `projectId`, `workspaceId` via `metadata: Record<string, any>`
- Pas de validation, risque d'incohérence

**3. Storage Fragmenté**

- Orchestrateur: `./data/tasks/`, `./data/interventions/`, `./data/tasks/{id}/trace/`
- Backend: `./data/projects.json`, `./data/workers.json`
- TraceChunkStorage dupliqué dans TasksService et Orchestrator
- Impossible de faire des queries complexes (JOIN tasks + projects)

**4. Responsabilités Floues**

- Orchestrateur: "Je gère les tasks" mais ne comprend pas projectId/workspaceId
- Backend: "J'enrichis les tasks" mais dépend de l'orchestrateur pour les lire
- Qui est propriétaire du lifecycle? Qui décide de l'assignment?

### Architecture Actuelle

```
Frontend
  ↓ (HTTP/WebSocket)
Backend
  ├─> TasksService (lit tasks via orchestrator, transforme, enrichit)
  ├─> OrchestratorRepository
  │     └─> OrchestratorWrapper (library mode)
  │           └─> Orchestrator.TaskManager
  │                 └─> Storage.ts (./data/tasks/)
  │
  └─> OrchestratorEventBridge (transforme O2B → B2F events)

Orchestrator
  ├─> TaskManager (CRUD tasks, assignment, queuing)
  ├─> InterventionManager (CRUD interventions)
  ├─> TraceChunkStorage (écrit traces)
  └─> WorkerWebSocketServer (gère connexions workers)
```

**Problème:** Double responsabilité sur tasks - orchestrator les stocke, backend les enrichit.

---

## Architecture Recommandée: Backend-Centric

### Principe Fondamental

**L'orchestrateur ne gère QUE la coordination des workers. Le backend possède TOUTES les données.**

### Nouvelle Séparation des Responsabilités

**Orchestrateur (Worker Coordinator)**

```
Responsabilités:
- Gérer connexions WebSocket des workers
- Maintenir queues en mémoire pour performance (global backlog, worker queues)
- Transmettre assignments aux workers (O2W messages)
- Recevoir updates des workers (W2O messages)
- Pass-through pour traces vers backend
- Pass-through pour interventions vers backend
- Notifier backend des changements d'état workers

Entités en Mémoire (AUCUN STORAGE):
- WorkerConnection: {workerId, socket, connectedAt, availableFlows}
- AssignmentQueue: {global: Task[], perWorker: Map<workerId, Task[]>}
- IdleWorkers: Set<workerId>

PAS de storage fichier, PAS de base de données
```

**Backend (Data Owner & Business Logic)**

```
Responsabilités:
- CRUD tasks (storage, lifecycle, business logic)
- CRUD projects
- CRUD interventions
- CRUD worker metadata
- Workspace metadata
- Trace storage (TraceChunkStorage)
- Décider quelles tasks sont assignables (business rules)
- Notifier orchestrator pour assignment
- Recevoir events de l'orchestrator (worker connected, task started, etc.)

Entités Persistées:
- Task: {id, description, status, priority, assignedWorker, flowId, flowResult,
         projectId, workspaceId, version, createdAt, updatedAt}
- Project: {id, name, workspaceIds, taskCount, ...}
- Intervention: {id, taskId, type, config, response, version, timestamps}
- WorkerMetadata: {id, name, capabilities, status, lastSeen}
- Traces: ./data/tasks/{taskId}/trace/ (TraceChunkStorage)

Storage:
- ./data/tasks.json (ou ./data/tasks/{id}.json pour scale)
- ./data/projects.json
- ./data/interventions.json
- ./data/workers.json
- ./data/tasks/{id}/trace/ (traces chunked)

Schema Authority:
- shared-frontend-backend/api/*.contract.ts (single source of truth)
```

### Flux de Données

**1. Création de Task**

```
Frontend → Backend.TasksService.createTask()
  ↓
Backend crée task dans son storage avec projectId/workspaceId
  ↓
Backend notifie Orchestrator: "nouvelle task assignable"
  ↓
Orchestrator ajoute à sa queue en mémoire
  ↓
Orchestrator décide du timing optimal et assigne à un worker
  ↓
Orchestrator envoie O2W_ASSIGN_TASK au worker
  ↓
Orchestrator notifie Backend: "task assignée à workerX"
  ↓
Backend met à jour task.status = 'in_progress', task.assignedWorker = workerX
  ↓
Backend émet B2F_TASK_UPDATED event → Frontend
```

**2. Exécution et Traces**

```
Worker exécute task, envoie W2O_TASK_TRACE_UPDATE
  ↓
Orchestrator reçoit trace update (pass-through, ne stocke PAS)
  ↓
Orchestrator envoie à Backend
  ↓
Backend écrit dans TraceChunkStorage (./data/tasks/{id}/trace/)
  ↓
Backend émet B2F_TASK_TRACE_UPDATED → Frontend (real-time)
```

**3. Intervention Utilisateur**

```
Worker demande intervention: W2O_INTERVENTION_REQUESTED
  ↓
Orchestrator reçoit (pass-through)
  ↓
Orchestrator envoie à Backend
  ↓
Backend crée intervention dans son storage
  ↓
Backend émet B2F_INTERVENTION_CREATED → Frontend
  ↓
User répond via Frontend → Backend
  ↓
Backend met à jour intervention, notifie Orchestrator
  ↓
Orchestrator envoie O2W_INTERVENTION_RESPONSE au worker
```

**4. Worker Connection**

```
Worker se connecte via WebSocket
  ↓
Orchestrator crée WorkerConnection en mémoire
  ↓
Orchestrator notifie Backend: "worker connected"
  ↓
Backend crée/update WorkerMetadata (lastSeen, status=online)
  ↓
Backend émet B2F_WORKER_CONNECTED → Frontend
```

### Nouveaux Composants

**1. Orchestrator: WorkerCoordinator (nouveau, remplace TaskManager)**

```typescript
// packages/orchestrator/src/core/WorkerCoordinator.ts
class WorkerCoordinator {
	private workers: Map<string, WorkerConnection> = new Map();
	private globalBacklog: Task[] = [];
	private workerQueues: Map<string, Task[]> = new Map();
	private idleWorkers: Set<string> = new Set();

	// Appelé par Backend quand task devient assignable
	enqueueTask(task: Task): void {
		if (task.assignedWorker) {
			this.workerQueues.get(task.assignedWorker.workerId).push(task);
		} else {
			this.globalBacklog.push(task);
		}
		this.tryAssignTasks(); // Décide du timing optimal
	}

	// Orchestrator décide quand assigner (pas de latency, worker idle)
	private tryAssignTasks(): void {
		for (const workerId of this.idleWorkers) {
			const task = this.getNextTaskForWorker(workerId);
			if (task) {
				this.assignTaskToWorker(task, workerId);
			}
		}
	}

	// Envoie O2W_ASSIGN_TASK et notifie backend
	private assignTaskToWorker(task: Task, workerId: string): void {
		const worker = this.workers.get(workerId);
		worker.socket.send({ type: 'ASSIGN_TASK', task });
		this.idleWorkers.delete(workerId);

		// Notifie backend pour mise à jour persistence
		this.notifyBackend('task_assigned', { taskId: task.id, workerId });
	}

	// Reçoit W2O messages des workers
	onWorkerMessage(workerId: string, message: W2OMessage): void {
		switch (message.type) {
			case 'TASK_STARTED':
				this.notifyBackend('task_started', message.data);
				break;
			case 'TASK_TRACE_UPDATE':
				// Pass-through vers backend
				this.notifyBackend('task_trace_update', message.data);
				break;
			case 'INTERVENTION_REQUESTED':
				this.notifyBackend('intervention_requested', message.data);
				break;
			case 'TASK_COMPLETED':
				this.idleWorkers.add(workerId);
				this.notifyBackend('task_completed', message.data);
				this.tryAssignTasks(); // Assign next task
				break;
		}
	}

	// Interface vers Backend
	private notifyBackend(event: string, data: any): void {
		this.orchestrator.eventBridge.sendToBackend({ event, data });
	}
}
```

**2. Backend: OrchestratorEventHandler (nouveau)**

```typescript
// packages/web-backend/src/services/OrchestratorEventHandler.ts
class OrchestratorEventHandler {
  constructor(
    private tasksService: TasksService,
    private interventionsService: InterventionsService,
    private workersService: WorkersService,
  ) {}

  // Écoute events de l'orchestrator
  handleOrchestratorEvent(event: string, data: any): void {
    switch (event) {
      case 'worker_connected':
        await this.workersService.markOnline(data.workerId);
        break;
      case 'task_assigned':
        await this.tasksService.markAssigned(data.taskId, data.workerId);
        break;
      case 'task_started':
        await this.tasksService.markStarted(data.taskId);
        break;
      case 'task_trace_update':
        await this.tasksService.writeTrace(data.taskId, data.trace);
        break;
      case 'intervention_requested':
        await this.interventionsService.create(data);
        break;
      case 'task_completed':
        await this.tasksService.markCompleted(data.taskId, data.result);
        break;
    }
  }
}
```

**3. Backend: TasksService Simplifié**

```typescript
// packages/web-backend/src/services/TasksService.ts
class TasksService {
	async createTask(data: CreateTask): Promise<Task> {
		// Crée task dans backend storage (avec projectId, workspaceId, version)
		const task = await this.tasksRepository.create({
			...data,
			status: 'backlog',
			version: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		// Notifie orchestrator pour queuing
		this.orchestrator.enqueueTask(task);

		// Émet event vers frontend
		this.eventBroadcaster.broadcast(B2F_TASK_CREATED, task);

		return task;
	}

	async getTasks(filters: TaskFilters): Promise<Task[]> {
		// Query directement depuis backend storage (peut filter par projectId!)
		return this.tasksRepository.query(filters);
	}

	async writeTrace(taskId: string, traceChunk: any): Promise<void> {
		// Backend écrit traces directement
		await this.traceStorage.appendChunk(taskId, traceChunk);

		// Émet event real-time vers frontend
		this.eventBroadcaster.broadcast(B2F_TASK_TRACE_UPDATED, {
			taskId,
			stepsCount: traceChunk.length,
		});
	}

	async markAssigned(taskId: string, workerId: string): Promise<void> {
		const task = await this.tasksRepository.update(taskId, {
			status: 'in_progress',
			assignedWorker: { workerId },
			updatedAt: new Date().toISOString(),
			version: task.version + 1, // Optimistic locking
		});

		this.eventBroadcaster.broadcast(B2F_TASK_UPDATED, task);
	}
}
```

---

## Plan d'Implémentation

### Phase 1: Créer Backend Storage pour Tasks/Interventions

**1.1 Migrer Tasks vers Backend Storage**

- [ ] Créer `TasksRepository` dans backend utilisant `DataStorage` (FileBasedStorage)
- [ ] Définir schema `Task` complet dans `shared-frontend-backend/tasks.contract.ts` avec:
    - `projectId`, `workspaceId` (plus besoin de metadata)
    - `version` pour optimistic locking
    - `assignedWorker: {workerId}` (pas `assignedTo`)
- [ ] Supprimer ancien schema de `shared-orch-worker/domain-types.ts` (Task)

**1.2 Migrer Interventions vers Backend Storage**

- [ ] Créer `InterventionsRepository` dans backend
- [ ] Définir schema complet dans `shared-frontend-backend/interventions.contract.ts`
- [ ] Supprimer de `shared-orch-worker/domain-types.ts` (Intervention)

**1.3 Migration des Données Existantes**

- [ ] Script pour migrer `./data/tasks/*.json` (orchestrator) vers `./data/tasks.json` (backend)
- [ ] Extraire `projectId`/`workspaceId` de metadata, ajouter `version: 1`
- [ ] Migrer `./data/interventions/*.json` vers backend storage
- [ ] Supprimer ancien `Storage.ts` de l'orchestrator

**Fichiers à créer/modifier:**

- `packages/web-backend/src/repositories/TasksRepository.ts` (NEW)
- `packages/web-backend/src/repositories/InterventionsRepository.ts` (NEW)
- `packages/shared-frontend-backend/src/api/tasks.contract.ts` (MODIFY - schema complet)
- `packages/shared-frontend-backend/src/api/interventions.contract.ts` (MODIFY)
- `packages/web-backend/src/migrations/migrate-to-backend-storage.ts` (NEW)
- `packages/orchestrator/src/core/Storage.ts` (DELETE)

### Phase 2: Refactorer Orchestrateur en Worker Coordinator

**2.1 Créer WorkerCoordinator**

- [ ] Créer `WorkerCoordinator.ts` dans orchestrator
- [ ] Implémenter queues en mémoire (globalBacklog, workerQueues, idleWorkers)
- [ ] Implémenter `enqueueTask(task)` - appelé par backend
- [ ] Implémenter `tryAssignTasks()` - décide du timing optimal
- [ ] Implémenter `onWorkerMessage()` - pass-through vers backend

**2.2 Supprimer TaskManager**

- [ ] Supprimer `TaskManager.ts` (logique de CRUD tasks)
- [ ] Garder seulement la partie assignment/queuing → migrer vers WorkerCoordinator
- [ ] Supprimer `InterventionManager.ts` (backend gère maintenant)

**2.3 Interface Backend ↔ Orchestrator**

- [ ] Créer `BackendEventBridge` dans orchestrator pour notifier backend
- [ ] Créer `OrchestratorEventHandler` dans backend pour recevoir events
- [ ] Communication bidirectionnelle:
    - Backend → Orchestrator: `enqueueTask`, `respondToIntervention`
    - Orchestrator → Backend: `worker_connected`, `task_started`, `task_trace_update`, etc.

**Fichiers:**

- `packages/orchestrator/src/core/WorkerCoordinator.ts` (NEW)
- `packages/orchestrator/src/core/BackendEventBridge.ts` (NEW)
- `packages/web-backend/src/services/OrchestratorEventHandler.ts` (NEW)
- `packages/orchestrator/src/core/TaskManager.ts` (DELETE)
- `packages/orchestrator/src/core/InterventionManager.ts` (DELETE)
- `packages/orchestrator/src/core/Orchestrator.ts` (MODIFY - use WorkerCoordinator)

### Phase 3: Refactorer TasksService et InterventionsService

**3.1 TasksService Direct Storage Access**

- [ ] Supprimer `OrchestratorRepository` (plus besoin)
- [ ] Utiliser directement `TasksRepository` pour CRUD
- [ ] Implémenter `markAssigned()`, `markStarted()`, `markCompleted()` (appelés par OrchestratorEventHandler)
- [ ] Implémenter `writeTrace()` avec TraceChunkStorage backend (supprimer duplication)
- [ ] Plus besoin de transformations (assignedTo → assignedWorker)

**3.2 InterventionsService Direct Storage Access**

- [ ] Utiliser directement `InterventionsRepository`
- [ ] Supprimer injection de `version` (géré par repository)
- [ ] Implémenter `create()` (appelé par OrchestratorEventHandler)
- [ ] Implémenter `respondToIntervention()` qui notifie orchestrator

**Fichiers:**

- `packages/web-backend/src/services/TasksService.ts` (REFACTOR)
- `packages/web-backend/src/services/InterventionsService.ts` (REFACTOR)
- `packages/web-backend/src/repositories/OrchestratorRepository.ts` (DELETE)

### Phase 4: Simplifier Event Flow

**4.1 Éliminer Transformations**

- [ ] Supprimer `OrchestratorEventBridge` (plus de O2B → B2F transformation)
- [ ] Backend émet directement B2F events depuis TasksService/InterventionsService
- [ ] Orchestrator émet des events vers backend (via BackendEventBridge)
- [ ] Plus de StateManager dans orchestrator (plus d'events O2B)

**Fichiers:**

- `packages/web-backend/src/transport/OrchestratorEventBridge.ts` (DELETE)
- `packages/orchestrator/src/core/StateManager.ts` (DELETE ou simplifier)

### Phase 5: Mettre à Jour OrchestratorWrapper

**5.1 Nouveau Wrapper API**

- [ ] Simplifier `OrchestratorWrapper` pour exposer seulement:
    - `enqueueTask(task)` - backend appelle pour queuing
    - `getWorkers()` - liste workers connectés
    - `respondToIntervention(id, response)` - transmet réponse au worker
    - `registerBackendHandler(handler)` - backend s'enregistre pour recevoir events
- [ ] Supprimer tous les CRUD tasks/interventions (backend les gère maintenant)

**Fichiers:**

- `packages/orchestrator/src/core/OrchestratorWrapper.ts` (REFACTOR)

### Phase 6: Mettre à Jour Frontend (si nécessaire)

**6.1 Schema Unifié**

- [ ] Frontend utilise désormais schema unique de `shared-frontend-backend`
- [ ] Plus de `assignedTo` vs `assignedWorker` confusion
- [ ] `task.projectId`, `task.workspaceId` disponibles directement

**Fichiers:**

- Potentiellement aucun changement si schema API reste compatible

### Phase 7: Cleanup et Documentation

**7.1 Nettoyer Code Legacy**

- [ ] Supprimer tous les fichiers de storage de l'orchestrator
- [ ] Supprimer transformations manuelles
- [ ] Supprimer packages `shared-orch-worker` (si plus utilisé, ou garder seulement protocol W2O/O2W)
- [ ] Nettoyer dependencies

**7.2 Documentation**

- [ ] Mettre à jour `.claude/kb/lessons-learned.md`:
    - "Orchestrator ne stocke JAMAIS de données"
    - "Backend est propriétaire de TOUTES les données"
    - "Communication: Backend → Orchestrator pour queuing, Orchestrator → Backend pour events"
- [ ] Créer diagramme d'architecture

**Fichiers:**

- `.claude/kb/lessons-learned.md` (UPDATE)
- `README.md` (UPDATE architecture section)

---

## Ownership Model Final

| Donnée                 | Propriétaire | Storage                     | Schema Authority          |
| ---------------------- | ------------ | --------------------------- | ------------------------- |
| **Tasks**              | Backend      | `./data/tasks.json`         | `shared-frontend-backend` |
| **Task traces**        | Backend      | `./data/tasks/{id}/trace/`  | Backend                   |
| **Interventions**      | Backend      | `./data/interventions.json` | `shared-frontend-backend` |
| **Projects**           | Backend      | `./data/projects.json`      | `shared-frontend-backend` |
| **Worker metadata**    | Backend      | `./data/workers.json`       | `shared-frontend-backend` |
| **Workspace metadata** | Backend      | Workspace dirs              | Backend                   |
| **Worker connections** | Orchestrator | EN MÉMOIRE SEULEMENT        | Orchestrator              |
| **Assignment queues**  | Orchestrator | EN MÉMOIRE SEULEMENT        | Orchestrator              |

**Règle d'Or:** Si c'est persisté → Backend. Si c'est en mémoire (queues, connexions) → Orchestrator.

---

## Architecture Finale

```
Frontend
  ↓ (HTTP/WebSocket)
Backend (Data Owner)
  ├─> TasksService (CRUD tasks, trace storage)
  │     └─> TasksRepository → ./data/tasks.json
  │     └─> TraceChunkStorage → ./data/tasks/{id}/trace/
  │
  ├─> InterventionsService (CRUD interventions)
  │     └─> InterventionsRepository → ./data/interventions.json
  │
  ├─> ProjectsService
  │     └─> ProjectsRepository → ./data/projects.json
  │
  ├─> WorkersService
  │     └─> WorkersRepository → ./data/workers.json
  │
  ├─> OrchestratorEventHandler (écoute events orchestrator)
  │     └─> Appelle TasksService, InterventionsService, WorkersService
  │
  └─> OrchestratorWrapper
        └─> enqueueTask(task), respondToIntervention(id, response)

Orchestrator (Worker Coordinator - NO STORAGE)
  ├─> WorkerCoordinator
  │     ├─> globalBacklog: Task[] (en mémoire)
  │     ├─> workerQueues: Map<workerId, Task[]> (en mémoire)
  │     ├─> idleWorkers: Set<workerId> (en mémoire)
  │     └─> tryAssignTasks() - décide timing optimal
  │
  ├─> WorkerWebSocketServer
  │     └─> Gère connexions WebSocket workers
  │
  └─> BackendEventBridge
        └─> Notifie backend: worker_connected, task_started, task_trace_update, etc.

Workers
  ↕ (WebSocket)
Orchestrator (relay messages)
```

---

## Bénéfices

**✅ Single Source of Truth**

- Backend possède TOUTES les données
- Un seul schema (shared-frontend-backend)
- Plus de duplication, plus de transformations

**✅ Queries Simplifiées**

- Backend peut faire JOIN tasks + projects directement
- Filtrage par projectId sans charger toutes les tasks
- Migrations vers DB facilitées (un seul storage à migrer)

**✅ Orchestrateur Ultra-Léger**

- Seulement coordination workers
- Pas de storage, pas de persistence
- Peut scale horizontalement (stateless sauf queues en mémoire)
- Facile à redémarrer (backend réenqueue tasks)

**✅ Séparation Claire**

- Orchestrator = Worker coordination (queuing, timing, WebSocket)
- Backend = Data + Business logic
- Plus de responsabilités floues

**✅ Meilleure Maintenabilité**

- Backend évolue indépendamment (ajouter champs à Task = juste modifier schema backend)
- Orchestrator stable (interface minimale)
- Tests simplifiés (backend teste CRUD, orchestrator teste queuing)

**✅ Type Safety**

- Plus de metadata non typé
- Schema unique avec validation Zod complète

---

## Trade-offs

**Pros:**

- ✅ Architecture claire et simple
- ✅ Single source of truth
- ✅ Meilleure queryabilité
- ✅ Orchestrator stateless (facilite scaling)
- ✅ Plus maintenable

**Cons:**

- ⚠️ Refactoring important (mais une seule fois)
- ⚠️ Orchestrator dépend de backend pour données (acceptable en library mode)
- ⚠️ Si extraction orchestrator en service indépendant → besoin API backend

---

## Stratégie de Test

**Unit Tests:**

- Backend: TasksRepository CRUD, InterventionsRepository CRUD
- Backend: TasksService business logic (markAssigned, markCompleted, etc.)
- Orchestrator: WorkerCoordinator queuing logic (globalBacklog, workerQueues)
- Orchestrator: Assignment algorithm (tryAssignTasks)

**Integration Tests:**

- Create task → backend storage → orchestrator enqueued → assignment
- Worker sends trace → orchestrator pass-through → backend writes → frontend notified
- Worker requests intervention → backend creates → frontend notified → user responds → worker receives

**Performance Tests:**

- 10,000 tasks in backend storage (query performance)
- Concurrent task creation + assignment
- Trace writing throughput

---

## Validation

Pour valider que les changements sont corrects:

1. **Tests automatisés**: `npm run test:agent` - tous verts
2. **Type checking**: `npm run check` - aucune erreur TypeScript
3. **Test manuel**:
    - Créer task avec project → stocké dans backend avec projectId
    - Task automatiquement enqueued dans orchestrator
    - Worker idle → task assignée
    - Worker exécute → traces écrites dans backend
    - Worker termine → task marquée completed dans backend
    - Frontend affiche tout en temps réel
4. **Vérifier Storage**: Plus de `./data/tasks/` dans orchestrator, tout dans backend
5. **Test Migration**: Script migre toutes données existantes sans perte

---

## Fichiers Critiques

### À Créer

- `packages/web-backend/src/repositories/TasksRepository.ts`
- `packages/web-backend/src/repositories/InterventionsRepository.ts`
- `packages/web-backend/src/services/OrchestratorEventHandler.ts`
- `packages/orchestrator/src/core/WorkerCoordinator.ts`
- `packages/orchestrator/src/core/BackendEventBridge.ts`
- `packages/web-backend/src/migrations/migrate-to-backend-storage.ts`

### À Supprimer

- `packages/orchestrator/src/core/Storage.ts` (task/intervention storage)
- `packages/orchestrator/src/core/TaskManager.ts` (CRUD logic → backend)
- `packages/orchestrator/src/core/InterventionManager.ts` (CRUD logic → backend)
- `packages/web-backend/src/repositories/OrchestratorRepository.ts` (plus nécessaire)
- `packages/web-backend/src/transport/OrchestratorEventBridge.ts` (transformations inutiles)
- `packages/orchestrator/src/core/StateManager.ts` (ou simplifier drastiquement)

### À Refactorer (Core)

- `packages/web-backend/src/services/TasksService.ts` - Direct storage, plus de transformations
- `packages/web-backend/src/services/InterventionsService.ts` - Direct storage
- `packages/orchestrator/src/core/Orchestrator.ts` - Use WorkerCoordinator au lieu de TaskManager
- `packages/orchestrator/src/core/OrchestratorWrapper.ts` - API simplifiée
- `packages/shared-frontend-backend/src/api/tasks.contract.ts` - Schema complet (projectId, workspaceId)

---

## Ordre d'Exécution Recommandé

1. **Phase 1** (Backend Storage) - Migration de données vers backend
2. **Phase 2** (WorkerCoordinator) - Refactorer orchestrator
3. **Phase 3** (Services) - TasksService/InterventionsService direct access
4. **Phase 4** (Events) - Simplifier event flow
5. **Phase 5** (Wrapper) - API simplifiée OrchestratorWrapper
6. **Phase 6** (Frontend) - Ajustements si nécessaires
7. **Phase 7** (Cleanup) - Supprimer code legacy

Chaque phase peut être testée indépendamment avant de passer à la suivante.
