# Plan: Refactor Orchestrator Storage — Délégation au backend

## Context

**Problème double découvert :**

1. L'orchestrateur a une classe `Storage` statique, sans interface, sans DI → tests fragiles
2. Le backend A DÉJÀ `TasksRepository` et `InterventionsRepository` (via `DataStoreFactory`) → duplication des données entre `data/tasks/{id}.json` (orchestrateur) et `data/tasks.json` (backend)

**Objectif :** Appliquer le principe d'inversion de dépendances — l'orchestrateur définit l'interface dont il a besoin (`IOrchestratorStorage`), le backend l'implémente via un adapter. En mode standalone, l'orchestrateur utilise sa propre implémentation filesystem. Les tests injectent une implémentation in-memory.

---

## Architecture cible

```
packages/orchestrator/src/storage/
  IOrchestratorStorage.ts            ← interface (définit le contrat)
  InMemoryOrchestratorStorage.ts     ← impl tests (nouveau)
  InMemoryOrchestratorStorage.test.ts
  FileBasedOrchestratorStorage.ts    ← impl standalone (extrait de Storage.ts)

packages/web-backend/src/orchestrator/
  OrchestratorStorageAdapter.ts      ← impl library mode (wraps TasksRepo + InterventionsRepo)

packages/orchestrator/src/core/
  KnowledgeStorage.ts                ← ce qui reste de Storage.ts (Knowledge JSONL + context dirs)
```

---

## Interface `IOrchestratorStorage`

Méthodes entity-spécifiques (2 entités seulement — pas besoin de générique table-based) :

```ts
export interface IOrchestratorStorage {
	// Tasks
	saveTask(task: Task): Promise<void>;
	loadTask(taskId: string): Promise<Task | null>;
	listTasks(): Promise<Task[]>;
	deleteTask(taskId: string): Promise<void>;
	taskExists(taskId: string): Promise<boolean>;
	clearAllTasks(): Promise<number>;

	// Interventions
	saveIntervention(intervention: Intervention): Promise<void>;
	loadIntervention(id: string): Promise<Intervention | null>;
	listInterventions(): Promise<Intervention[]>;
	deleteIntervention(id: string): Promise<void>;
	interventionExists(id: string): Promise<boolean>;
	findInterventionsByTaskId(taskId: string): Promise<Intervention[]>;
	findInterventionsByStatus(status: InterventionStatus): Promise<Intervention[]>;
}
```

---

## Étapes

### 1. Créer `IOrchestratorStorage.ts`

- Interface avec les méthodes ci-dessus
- Fichier : `packages/orchestrator/src/storage/IOrchestratorStorage.ts`

### 2. Créer `InMemoryOrchestratorStorage.ts`

- `Map<string, Task>` + `Map<string, Intervention>`
- Méthode `clear()` pour reset entre tests
- Fichier : `packages/orchestrator/src/storage/InMemoryOrchestratorStorage.ts`
- Tests : `InMemoryOrchestratorStorage.test.ts` (couverture ≥ 90%)

### 3. Créer `FileBasedOrchestratorStorage.ts`

- Extrait les méthodes Task + Intervention de `Storage.ts` actuel
- Implémente `IOrchestratorStorage`
- Conserve la même logique filesystem (1 JSON par entité)
- Utilisé en mode standalone (orchestrateur sans backend)
- Fichier : `packages/orchestrator/src/storage/FileBasedOrchestratorStorage.ts`

### 4. Renommer `Storage.ts` → `KnowledgeStorage.ts`

- Conserve uniquement : `addKnowledge`, `readKnowledge`, `getTaskContextDir`, `initialize`, `getDataDir`
- Méthodes statiques conservées (JSONL append-only, pas de DI nécessaire)
- Mettre à jour les imports dans les consommateurs (`TaskManager`, etc.)

### 5. Injecter `IOrchestratorStorage` dans `TaskManager`

- Paramètre constructeur : `storage: IOrchestratorStorage`
- Remplacer ~26 appels `Storage.saveTask/loadTask/etc.` par `this.storage.*`
- `initialize()` : `KnowledgeStorage.initialize()` pour le filesystem, `this.storage.listTasks()` pour le chargement
- Fichier : `packages/orchestrator/src/core/TaskManager.ts`

### 6. Injecter `IOrchestratorStorage` dans `InterventionManager`

- Paramètre constructeur : `storage: IOrchestratorStorage`
- Remplacer ~5 appels `Storage.*` par `this.storage.*`
- Fichier : `packages/orchestrator/src/core/InterventionManager.ts`

### 7. Mettre à jour `Orchestrator.ts`

- Ajouter `storage?: IOrchestratorStorage` dans `OrchestratorConfig`
- Fallback : `new FileBasedOrchestratorStorage()` si non fourni (mode standalone)
- Passer `storage` à `TaskManager` et `InterventionManager`
- Fichier : `packages/orchestrator/src/core/Orchestrator.ts`

### 8. Créer `OrchestratorStorageAdapter.ts` dans le backend

- Implémente `IOrchestratorStorage` en wrappant `TasksRepository` + `InterventionsRepository`
- Translate entre le type `Task` orchestrateur et le type `Task` backend si nécessaire (vérifier les types)
- Fichier : `packages/web-backend/src/orchestrator/OrchestratorStorageAdapter.ts`

### 9. Injecter l'adapter dans `server.ts`

- Dans `initializeOrchestratorClient()`, créer `OrchestratorStorageAdapter` depuis la factory
- Passer via `OrchestratorConfig.storage`
- Fichier : `packages/web-backend/src/server.ts`

### 10. Mettre à jour les tests

- `InterventionFlow.test.ts` : supprimer `vi.mock('../core/Storage')`, injecter `InMemoryOrchestratorStorage`
- `TaskManager.test.ts` : injecter `InMemoryOrchestratorStorage`
- Autres tests concernés : idem
- Backend tests : injecter un mock `IOrchestratorStorage` quand `OrchestratorStorageAdapter` est testé

---

## Fichiers critiques

| Fichier                                                                 | Action                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/orchestrator/src/storage/IOrchestratorStorage.ts`             | Créer                                                                |
| `packages/orchestrator/src/storage/InMemoryOrchestratorStorage.ts`      | Créer                                                                |
| `packages/orchestrator/src/storage/InMemoryOrchestratorStorage.test.ts` | Créer                                                                |
| `packages/orchestrator/src/storage/FileBasedOrchestratorStorage.ts`     | Créer (extrait Storage.ts)                                           |
| `packages/orchestrator/src/core/Storage.ts`                             | → Renommer `KnowledgeStorage.ts`                                     |
| `packages/orchestrator/src/core/TaskManager.ts`                         | Injecter `IOrchestratorStorage`                                      |
| `packages/orchestrator/src/core/InterventionManager.ts`                 | Injecter `IOrchestratorStorage`                                      |
| `packages/orchestrator/src/core/Orchestrator.ts`                        | Accepter storage dans config + fallback FileBasedOrchestratorStorage |
| `packages/web-backend/src/orchestrator/OrchestratorStorageAdapter.ts`   | Créer                                                                |
| `packages/web-backend/src/server.ts`                                    | Injecter OrchestratorStorageAdapter                                  |
| `packages/orchestrator/src/websocket/InterventionFlow.test.ts`          | Retirer vi.mock, utiliser InMemoryOrchestratorStorage                |
| Tests TaskManager, WorkerWebSocketServer, etc.                          | Mettre à jour constructeurs                                          |

## Références modèle

- `packages/web-backend/src/storage/DataStorage.ts` — pattern interface
- `packages/web-backend/src/storage/InMemoryStorage.ts` — pattern in-memory
- `packages/web-backend/src/factories/DataStoreFactory.ts` — pattern factory/DI
- `packages/web-backend/src/repositories/TasksRepository.ts` — wrappé par l'adapter

---

## Point à vérifier avant implémentation

Les types `Task` et `Intervention` de l'orchestrateur vs du backend peuvent différer légèrement (définis dans `shared-orch-worker`). L'adapter devra potentiellement mapper entre les deux formats.

---

## Vérification

1. `npm run check` — zéro erreur TypeScript/ESLint
2. `cd packages/orchestrator && npx vitest run` — tous les tests passent en isolation
3. `npm run test:agent` — tous les tests passent en parallèle (valide que le flaky est résolu sans vi.mock)
