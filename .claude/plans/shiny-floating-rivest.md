# Plan: Standardisation des logs

## Contexte

Actuellement, les logs affichent un format inconsistant:

- ✅ Logs corrects: `[19:10:37.702] [ INFO] GET /api/tasks/i4u02sqfx 200 376ms`
- ❌ Logs inconsistants: `[TasksService] Fetching task i4u02sqfx with full trace...`

**Objectif:** Format uniforme `[timestamp] [LEVEL] [ServiceName] message` pour tous les logs

**Problème actuel:**

- 100+ console.log répartis dans 40 fichiers
- Logger custom existant dans `packages/shared-common/src/logger.ts` sans support pour les noms

---

## Stratégie d'implémentation

### Règle générale

**Par défaut: Approche Module** (const au niveau fichier)

- ✅ Pour tous les fichiers simples avec une seule classe
- ✅ Pour les fichiers utilitaires avec des fonctions
- ✅ Syntaxe ultra-concise: `log.info()`

**Exception: Approche Instance** (field dans la classe)

- ⚠️ Seulement pour classes avec loggers dynamiques (FlowWorker, etc.)
- ⚠️ Seulement pour fichiers avec plusieurs classes instanciées différemment

---

## Approche 1 (PAR DÉFAUT): Logger const au niveau module

### Description

Logger déclaré comme const au niveau du fichier, en dehors de la classe.
**Utiliser pour 80% des fichiers du projet.**

### Modifications au logger.ts

```typescript
// packages/shared-common/src/logger.ts
class Logger {
	private level: LogLevel;
	private name?: string;

	constructor(name?: string) {
		this.level = (process.env.LOG_LEVEL as LogLevel) || 'debug';
		this.name = name;
	}

	info(message: string, ...args: unknown[]) {
		if (this.shouldLog('info')) {
			const namePrefix = this.name ? `[${this.name}] ` : '';
			console.info(`[${this.getTimestamp()}] [${'INFO'.padStart(5)}] ${namePrefix}${message}`, ...args);
		}
	}

	// debug(), warn(), error() similaires...
}

// Factory function
export function createLogger(name: string): Logger {
	return new Logger(name);
}

// Singleton pour rétrocompatibilité
export const logger = new Logger();
```

### Exemple 1: Service simple (TasksService)

```typescript
// packages/web-backend/src/services/TasksService.ts
import { createLogger } from 'shared-common/logger';

const log = createLogger('TasksService');

export class TasksService {
	private tasksRepository: TasksRepository;

	constructor(tasksRepository: TasksRepository) {
		this.tasksRepository = tasksRepository;
	}

	async fetchTask(taskId: string): Promise<Task | null> {
		log.info(`Fetching task ${taskId} with full trace...`);

		try {
			const task = await this.tasksRepository.getTask(taskId);
			if (!task) {
				log.warn(`Task ${taskId} not found`);
				return null;
			}
			log.debug(`Task ${taskId} fetched successfully`);
			return task;
		} catch (error) {
			log.error(`Failed to fetch task ${taskId}:`, error);
			throw error;
		}
	}

	async fetchLogs(taskId: string, cursor?: string, limit = 100): Promise<LogEntry[]> {
		log.info(`Fetching logs for task ${taskId}, cursor=${cursor}, limit=${limit}`);
		return this.tasksRepository.getLogs(taskId, cursor, limit);
	}
}
```

**Output:**

```
[19:10:37.702] [ INFO] [TasksService] Fetching task i4u02sqfx with full trace...
[19:10:37.966] [DEBUG] [TasksService] Task i4u02sqfx fetched successfully
[19:10:38.155] [ INFO] [TasksService] Fetching logs for task i4u02sqfx, cursor=undefined, limit=100
```

### Exemple 2: InterventionManager

```typescript
// packages/orchestrator/src/core/InterventionManager.ts
import { createLogger } from 'shared-common/logger';

const log = createLogger('InterventionManager');

export class InterventionManager {
	private interventions = new Map<string, Intervention>();

	async createIntervention(taskId: string, type: InterventionType): Promise<Intervention> {
		log.info(`Creating intervention for task ${taskId} (type: ${type})`);

		const intervention = {
			id: generateId(),
			taskId,
			type,
			status: 'pending',
			createdAt: Date.now(),
		};

		this.interventions.set(intervention.id, intervention);
		log.debug(`Intervention ${intervention.id} created`);

		return intervention;
	}

	async answerIntervention(interventionId: string, response: string): Promise<void> {
		log.info(`Intervention ${interventionId} answered`);
		const intervention = this.interventions.get(interventionId);

		if (!intervention) {
			log.warn(`Intervention ${interventionId} not found`);
			return;
		}

		intervention.status = 'resolved';
		intervention.response = response;
		log.debug(`Intervention ${interventionId} resolved with response`);
	}
}
```

### Exemple 3: Fichier avec fonctions utilitaires

```typescript
// packages/web-backend/src/utils/taskHelpers.ts
import { createLogger } from 'shared-common/logger';

const log = createLogger('taskHelpers');

export function validateTaskId(taskId: string): boolean {
	log.debug(`Validating task ID: ${taskId}`);

	if (!taskId || taskId.length < 5) {
		log.warn(`Invalid task ID: ${taskId}`);
		return false;
	}

	return true;
}

export function formatTaskDescription(description: string): string {
	log.debug('Formatting task description');
	return description.trim().substring(0, 200);
}
```

### Quand utiliser cette approche

✅ **Services simples** (TasksService, WorkersService, ProjectsService, InterventionsService)
✅ **Managers** (InterventionManager, si une seule instance)
✅ **Controllers** (TransportsController, IngredientsController)
✅ **Repositories** (TasksRepository, WorkspaceMetadataRepository)
✅ **Fichiers utilitaires** avec des fonctions
✅ **Tout fichier avec une seule classe qui n'a pas de logger dynamique**

### Quand NE PAS utiliser

❌ Classes avec logger dynamique (FlowWorker avec workerId)
❌ Fichiers exportant plusieurs classes différentes utilisées simultanément
❌ Classes instanciées plusieurs fois avec contextes différents

---

## Approche 2 (EXCEPTION): Logger instance dans la classe

### Description

Logger déclaré comme field privé dans la classe.
**Utiliser seulement pour les cas spéciaux (environ 20% des fichiers).**

### Modifications au logger.ts

Identique à l'approche 1 (même factory `createLogger`).

### Exemple 1: FlowWorker (logger dynamique)

```typescript
// packages/worker/src/flow/FlowWorker.ts
import { type Logger, createLogger } from 'shared-common/logger';

export class FlowWorker {
	private logger: Logger;
	private workerId: string = '?';
	private currentTask?: Task;

	constructor(private config: FlowWorkerConfig) {
		this.logger = createLogger('FlowWorker ?');
		this.logger.info('Initializing...');
	}

	private handleWelcome(message: WorkerWelcomeMessage): void {
		this.workerId = message.workerId;

		// Re-créer le logger avec le bon ID
		this.logger = createLogger(`FlowWorker ${this.workerId}`);

		this.logger.info(`Welcome received, assigned id=${message.workerId}`);
	}

	async executeTask(task: Task): Promise<void> {
		this.logger.info(`Assigned task ${task.id}: ${task.description}`);

		try {
			await this.runFlow(task);
			this.logger.info('Flow completed successfully');
		} catch (error) {
			this.logger.error('Flow execution failed:', error);
			throw error;
		}
	}

	private onTraceUpdate(trace: Trace): void {
		this.logger.debug(`Trace update - steps=${trace?.steps?.length || 0}`);
	}
}
```

**Output:**

```
[19:10:37.000] [ INFO] [FlowWorker ?] Initializing...
[19:10:37.100] [ INFO] [FlowWorker 2] Welcome received, assigned id=2
[19:10:38.200] [ INFO] [FlowWorker 2] Assigned task abc123: Create login page
[19:10:45.300] [DEBUG] [FlowWorker 2] Trace update - steps=5
[19:10:50.400] [ INFO] [FlowWorker 2] Flow completed successfully
```

### Exemple 2: ClaudeLifecycleManager (logger dynamique)

```typescript
// packages/worker/src/flow/ClaudeLifecycleManager.ts
import { type Logger, createLogger } from 'shared-common/logger';

export class ClaudeLifecycleManager {
	private logger: Logger;
	private claudeProcess?: ChildProcess;
	private claudeSocket?: WebSocket;

	constructor(
		private workerId: string,
		private claudeWsPort: number
	) {
		this.logger = createLogger(`ClaudeLifecycle[${workerId}]`);
		this.logger.info('Initializing lifecycle manager');
	}

	async startClaude(): Promise<void> {
		this.logger.info(`Starting Claude WebSocket server on port ${this.claudeWsPort}`);

		try {
			await this.createWebSocketServer();
			this.logger.info('WebSocket server started');

			await this.spawnClaudeProcess();
			this.logger.info('Claude process spawned');
		} catch (error) {
			this.logger.error('Failed to start Claude:', error);
			throw error;
		}
	}

	async shutdown(): Promise<void> {
		this.logger.info('Shutting down...');

		if (this.claudeSocket) {
			this.logger.debug('Closing Claude socket');
			this.claudeSocket.close();
		}

		if (this.claudeProcess) {
			this.logger.debug('Killing Claude process');
			this.claudeProcess.kill();
		}

		this.logger.info('Shutdown complete');
	}
}
```

### Exemple 3: Fichier avec plusieurs classes différentes

```typescript
// packages/web-backend/src/services/multiService.ts
import { type Logger, createLogger } from 'shared-common/logger';

export class TaskProcessor {
	private readonly logger = createLogger('TaskProcessor');

	process(task: Task): void {
		this.logger.info(`Processing task ${task.id}`);
		// ...
	}
}

export class TaskValidator {
	private readonly logger = createLogger('TaskValidator');

	validate(task: Task): boolean {
		this.logger.debug(`Validating task ${task.id}`);
		// ...
		return true;
	}
}
```

### Quand utiliser cette approche

⚠️ **FlowWorker** - Logger dynamique avec workerId
⚠️ **ClaudeLifecycleManager** - Logger dynamique avec workerId
⚠️ **Fichiers avec plusieurs classes** utilisées simultanément
⚠️ **Classes instanciées multiples fois** avec contextes différents

---

## Comparaison

| Critère             | Approche Module (défaut)  | Approche Instance (exception) |
| ------------------- | ------------------------- | ----------------------------- |
| Syntaxe             | `log.info()`              | `this.logger.info()`          |
| Boilerplate         | 1 ligne (top fichier)     | 1 ligne (dans classe)         |
| Mémoire             | 1 logger/fichier          | 1 logger/instance             |
| Use case            | Services simples, 80% cas | Loggers dynamiques, 20% cas   |
| Encapsulation       | ⚠️ Module-level           | ✅ Class-level                |
| Plusieurs instances | ❌ Problème partage       | ✅ OK                         |
| Loggers dynamiques  | ❌ Difficile              | ✅ Facile                     |

---

## Migration par priorité

### Tier 1 - Services (Approche Module)

1. `packages/web-backend/src/services/TasksService.ts`
2. `packages/web-backend/src/services/WorkersService.ts`
3. `packages/web-backend/src/services/InterventionsService.ts`
4. `packages/web-backend/src/services/ProjectsService.ts`
5. `packages/web-backend/src/services/FlowsService.ts`

**Pattern:**

```typescript
const log = createLogger('ServiceName');
```

### Tier 2 - Workers (Approche Instance)

1. `packages/worker/src/flow/FlowWorker.ts` - 48 console.log, logger dynamique
2. `packages/worker/src/flow/ClaudeLifecycleManager.ts` - 11 console.log, logger dynamique

**Pattern:**

```typescript
private logger: Logger;
constructor(...) {
    this.logger = createLogger(`FlowWorker ${id}`);
}
```

### Tier 3 - Managers/Core (Approche Module)

1. `packages/orchestrator/src/core/InterventionManager.ts`
2. `packages/orchestrator/src/core/WorkerCoordinator.ts`
3. Autres managers

**Pattern:**

```typescript
const log = createLogger('ManagerName');
```

### Tier 4 - Infrastructure (Approche Module)

- Transport adapters (WebSocket, SSE, HTTP Polling)
- Storage implementations
- Controllers
- Repositories
- Utilities

**Pattern:**

```typescript
const log = createLogger('ComponentName');
```

---

## Mapping des niveaux de log

| Console.log actuel                          | Niveau à utiliser |
| ------------------------------------------- | ----------------- |
| Lifecycle events (start, connect, shutdown) | `info`            |
| Opérations normales                         | `info`            |
| Données de trace, steps, détails            | `debug`           |
| Avertissements                              | `warn`            |
| Erreurs, exceptions                         | `error`           |

---

## Fichiers critiques à modifier

1. **`packages/shared-common/src/logger.ts`**
    - Ajouter support pour les noms dans le constructeur
    - Ajouter factory function `createLogger(name: string)`
    - Modifier info/debug/warn/error pour inclure `[name]` dans l'output

2. **`packages/web-backend/src/services/TasksService.ts`**
    - Migration avec approche module
    - Remplacer 4+ console.log par `log.info/debug/error()`

3. **`packages/worker/src/flow/FlowWorker.ts`**
    - Migration avec approche instance
    - Remplacer 48 console.log
    - Gérer logger dynamique avec workerId

4. **`packages/worker/src/flow/ClaudeLifecycleManager.ts`**
    - Migration avec approche instance
    - Remplacer 11 console.log
    - Logger dynamique avec workerId

5. **`packages/orchestrator/src/core/InterventionManager.ts`**
    - Migration avec approche module
    - Remplacer 6 console.log par `log.info/debug()`

6. **+35 autres fichiers** (services, controllers, repositories, transports)
    - Tous avec approche module sauf cas spéciaux identifiés

---

## Tests et vérification

### Tests unitaires

Créer `packages/shared-common/src/logger.test.ts`:

```typescript
import { createLogger, logger } from './logger';

describe('Logger', () => {
	it('should include name in output', () => {
		const log = createLogger('TestService');
		// Vérifier format: [timestamp] [LEVEL] [TestService] message
	});

	it('should work without name (backward compat)', () => {
		// Vérifier format: [timestamp] [LEVEL] message
	});
});
```

### Commandes de vérification

```bash
# Build
npm run build

# Tests unitaires logger
npm test -- logger.test.ts

# Tous les tests
npm run test:agent

# Vérifier console.log restants
grep -r "console\.log" packages/web-backend/src --include="*.ts"
grep -r "console\.log" packages/orchestrator/src --include="*.ts"
grep -r "console\.log" packages/worker/src --include="*.ts"
```

### Test end-to-end

1. Démarrer orchestrator
2. Démarrer worker
3. Créer une tâche
4. Vérifier logs dans console:
    - Format uniforme: `[HH:MM:SS.mmm] [LEVEL] [ServiceName] message`
    - Pas de préfixes dupliqués
    - Tous les services loggent avec leur nom

### Output attendu final

```
[19:10:37.702] [ INFO] [TasksService] Fetching task i4u02sqfx with full trace...
[19:10:37.966] [DEBUG] [TasksService] Task i4u02sqfx fetched successfully
[19:10:38.155] [ INFO] [FlowWorker 2] Connected to orchestrator
[19:10:43.105] [ INFO] [WebSocketTransport] Received w2o:worker:heartbeat from 2
[19:11:13.106] [ INFO] [InterventionManager] Creating intervention for task abc123
```

---

## Résumé de la stratégie

### Règle simple à suivre

**Question: Dois-je utiliser approche Module ou Instance?**

1. La classe a-t-elle besoin d'un logger dynamique (nom qui change)?
    - **OUI** → Approche Instance
    - **NON** → Approche Module

2. Y a-t-il plusieurs classes dans ce fichier instanciées différemment?
    - **OUI** → Approche Instance
    - **NON** → Approche Module

3. **Sinon** → Approche Module (par défaut)

### En pratique

- **~80% des fichiers:** `const log = createLogger('Name');` (module)
- **~20% des fichiers:** `private logger = createLogger('Name');` (instance)
- **Cas spéciaux identifiés:** FlowWorker, ClaudeLifecycleManager

**Priorité: Simplicité et concision. Utiliser l'approche module partout sauf nécessité claire.**
