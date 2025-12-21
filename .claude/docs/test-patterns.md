# Test Patterns - Guide de Migration vers test-utils

**Date**: 2025-12-16
**Objectif**: Standardiser l'écriture de tests en utilisant test-utils pour éliminer 80% de la duplication

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Patterns de Migration](#patterns-de-migration)
3. [Exemples Avant/Après](#exemples-avantaprès)
4. [Cheat Sheet](#cheat-sheet)
5. [Anti-Patterns](#anti-patterns)

---

## Vue d'ensemble

### Problème Actuel

**85% des tests créent leurs mocks manuellement**, causant:

- ~7,200 lignes de code dupliqué (20% du code de tests)
- Setup répétitif dans chaque fichier
- Maintenance difficile quand un mock change
- Incohérence entre les tests

### Solution

Utiliser les **test-utils existants** pour:

- Réduire le boilerplate de 80%
- Centraliser la définition des mocks
- Garantir la cohérence
- Accélérer l'écriture de nouveaux tests de 30%

### Utilitaires Disponibles

```typescript
import {
	MockFlowRegistry, // ✅ Mocks (classes et objets mock)
	MockIssueCollector,
	MockWebSocket,
	createMockConnectionManager,
	createMockFlow,
	createMockFlowExecutor,
	createMockStateManager, // ✅ Factories (créer des données de test)
	createMockTask,
	createMockTaskManager,
	createMockWorker,
	createMockWorkspace,
	createMockWorkspaceManager,
	createTempTestDir,
	createTestStep,
	mockStepExecution,
	setupConsoleMocks, // ✅ Helpers (utilitaires de test)
	setupTest,
	setupTimers,
	testCRUDEndpoint, // ✅ REST API Helpers
	testEndpoint,
	waitForCondition,
} from '../test-utils';
```

---

## Patterns de Migration

### Pattern 1: Setup Standard

#### ❌ Avant (répété dans 30+ fichiers)

```typescript
describe('MyTest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should work', () => {
		// test...
	});
});
```

**Problème**: 8 lignes de boilerplate répétées partout

#### ✅ Après (avec test-utils)

```typescript
import { setupTest } from '../test-utils';

describe('MyTest', () => {
	let cleanup: () => void;

	beforeEach(() => {
		cleanup = setupTest(); // Clear mocks + console setup
	});

	afterEach(() => {
		cleanup();
	});

	it('should work', () => {
		// test...
	});
});
```

**Gain**: 8 lignes → 3 lignes = **-62% de code**

---

### Pattern 2: Mock TaskManager

#### ❌ Avant (répété dans 15+ fichiers)

```typescript
let mockTaskManager: any;

beforeEach(() => {
	mockTaskManager = {
		getAllTasks: vi.fn().mockReturnValue([]),
		getTask: vi.fn(),
		addTask: vi.fn(),
		updateTaskStatus: vi.fn(),
		addComment: vi.fn(),
		assignTask: vi.fn(),
		unassignTask: vi.fn(),
		getNextTaskForWorker: vi.fn(),
	};
});
```

**Problème**: 12 lignes répétées dans chaque test

#### ✅ Après (avec test-utils)

```typescript
import { createMockTaskManager } from '../test-utils';

let mockTaskManager: ReturnType<typeof createMockTaskManager>;

beforeEach(() => {
	mockTaskManager = createMockTaskManager();
});
```

**Gain**: 12 lignes → 1 ligne = **-92% de code**

---

### Pattern 3: Création de FlowDefinition

#### ❌ Avant (répété dans 50+ fichiers)

```typescript
const flow: FlowDefinition = {
	id: 'test-flow',
	version: '1.0.0',
	name: 'Test Flow',
	description: 'Test description',
	workspace: {
		mode: 'isolated',
		gitStrategy: 'feature-branch',
		reusePolicy: 'if-available',
	},
	inputs: {},
	steps: [
		{
			id: 'step1',
			name: 'Step 1',
			type: 'model',
			model: 'sonnet',
			prompt: 'Test prompt',
		},
	],
};
```

**Problème**: 22 lignes répétées + erreurs de typage fréquentes

#### ✅ Après (avec test-utils)

```typescript
import { createMockFlow, createMockModelStep } from '../test-utils';

const flow = createMockFlow({
	id: 'test-flow',
	steps: [createMockModelStep({ prompt: 'Test prompt' })],
});
```

**Gain**: 22 lignes → 4 lignes = **-82% de code**

---

### Pattern 4: Mock StateManager

#### ❌ Avant (répété dans 10+ fichiers)

```typescript
let mockStateManager: any;

beforeEach(() => {
	mockStateManager = {
		emitTaskCreated: vi.fn(),
		emitTaskUpdated: vi.fn(),
		emitTaskDeleted: vi.fn(),
		emitWorkerConnected: vi.fn(),
		emitWorkerDisconnected: vi.fn(),
		emitWorkerTaskAssigned: vi.fn(),
		emitWorkerTaskReleased: vi.fn(),
		emitMetricsUpdated: vi.fn(),
	};
});
```

**Problème**: 11 lignes dupliquées

#### ✅ Après (avec test-utils)

```typescript
import { createMockStateManager } from '../test-utils';

let mockStateManager: ReturnType<typeof createMockStateManager>;

beforeEach(() => {
	mockStateManager = createMockStateManager();
});
```

**Gain**: 11 lignes → 1 ligne = **-91% de code**

---

### Pattern 5: Tests REST API

#### ❌ Avant (répété 95 fois dans RestAPI.test.ts)

```typescript
describe('GET /api/tasks', () => {
	it('should return all tasks', async () => {
		mockTaskManager.getAllTasks.mockReturnValue([]);

		const response = await request(app).get('/api/tasks');

		expect(response.status).toBe(200);
		expect(response.body).toEqual([]);
	});

	it('should handle errors', async () => {
		mockTaskManager.getAllTasks.mockImplementation(() => {
			throw new Error('Database error');
		});

		const response = await request(app).get('/api/tasks');

		expect(response.status).toBe(500);
	});
});
```

**Problème**: Pattern répété pour CHAQUE endpoint (95 fois!)

#### ✅ Après (avec test-utils)

```typescript
import { testEndpoint } from '../test-utils';

testEndpoint({
	app,
	request,
	method: 'get',
	path: '/api/tasks',
	mockSuccess: () => {
		mockTaskManager.getAllTasks.mockReturnValue([]);
	},
	mockError: fn => {
		mockTaskManager.getAllTasks.mockImplementation(() => {
			throw new Error('Database error');
		});
	},
});
```

**Gain**: 18 lignes → 9 lignes = **-50% de code**

**OU pour CRUD complet:**

```typescript
import { testCRUDEndpoint } from '../test-utils';

testCRUDEndpoint({
	app,
	request,
	basePath: '/api/tasks',
	mocks: {
		list: mockTaskManager.getAllTasks,
		get: mockTaskManager.getTask,
		create: mockTaskManager.addTask,
		update: mockTaskManager.updateTask,
		delete: mockTaskManager.deleteTask,
	},
});
```

**Gain**: ~100 lignes → 10 lignes = **-90% de code**

---

### Pattern 6: Mock StepTrace/Execution

#### ❌ Avant (répété dans 20+ fichiers)

```typescript
const stepTrace: StepTrace = {
	stepId: 'step-1',
	stepName: 'Test Step',
	stepType: 'model',
	startTime: Date.now(),
	endTime: Date.now() + 1000,
	durationMs: 1000,
	status: 'completed',
	outputs: { result: 'success' },
};

vi.mocked(executor.executeStep).mockResolvedValue(stepTrace);
```

**Problème**: 10 lignes répétées, facile d'oublier un champ

#### ✅ Après (avec test-utils)

```typescript
import { mockStepExecution } from '../test-utils';

const stepTrace = mockStepExecution({
	outputs: { result: 'success' },
});

vi.mocked(executor.executeStep).mockResolvedValue(stepTrace);
```

**Gain**: 10 lignes → 3 lignes = **-70% de code**

---

### Pattern 7: Fake Timers

#### ❌ Avant (répété dans 25+ fichiers)

```typescript
beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

it('should execute after delay', () => {
	// test with timers...
	vi.advanceTimersByTime(1000);
});
```

**Problème**: Setup répétitif, facile d'oublier le cleanup

#### ✅ Après (avec test-utils)

```typescript
import { setupTimers } from '../test-utils';

let cleanupTimers: () => void;

beforeEach(() => {
	cleanupTimers = setupTimers();
});

afterEach(() => {
	cleanupTimers();
});

it('should execute after delay', () => {
	// test with timers...
	vi.advanceTimersByTime(1000);
});
```

**Gain**: Plus sûr, garantit le cleanup

---

## Exemples Avant/Après

### Exemple Complet #1: FlowExecutor.test.ts

#### ❌ Avant (lignes 22-50)

```typescript
describe('FlowExecutor', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should execute flow successfully', async () => {
		const flow: FlowDefinition = {
			id: 'test-flow',
			version: '1.0.0',
			name: 'Test',
			description: 'Test',
			workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
			inputs: {},
			steps: [
				{
					id: 'step1',
					name: 'Step 1',
					type: 'model',
					model: 'sonnet',
					prompt: 'Test',
				},
			],
		};

		const stepTrace: StepTrace = {
			stepId: 'step1',
			stepName: 'Step 1',
			stepType: 'model',
			startTime: Date.now(),
			endTime: Date.now() + 1000,
			durationMs: 1000,
			status: 'completed',
			outputs: {},
		};

		vi.mocked(StepRunner.prototype.executeStep).mockResolvedValue(stepTrace);

		const executor = new FlowExecutor();
		const result = await executor.execute(flow, 'workspace-1', 'task-1');

		expect(result.success).toBe(true);
	});
});
```

**Total: 55 lignes**

#### ✅ Après (avec test-utils)

```typescript
import { createMockFlow, mockStepExecution, setupTest } from '../test-utils';

describe('FlowExecutor', () => {
	let cleanup: () => void;

	beforeEach(() => {
		cleanup = setupTest();
	});

	afterEach(() => {
		cleanup();
	});

	it('should execute flow successfully', async () => {
		const flow = createMockFlow({ id: 'test-flow' });
		const stepTrace = mockStepExecution({ stepId: 'step1' });

		vi.mocked(StepRunner.prototype.executeStep).mockResolvedValue(stepTrace);

		const executor = new FlowExecutor();
		const result = await executor.execute(flow, 'workspace-1', 'task-1');

		expect(result.success).toBe(true);
	});
});
```

**Total: 25 lignes**

**Gain: 55 → 25 lignes = -55% de code!** 🎉

---

### Exemple Complet #2: RestAPI.test.ts

#### ❌ Avant (lignes 50-150, répété 95 fois)

```typescript
describe('Task Management API', () => {
	let mockTaskManager: any;
	let mockStateManager: any;
	let app: Express;

	beforeEach(() => {
		vi.clearAllMocks();

		mockStateManager = {
			emitTaskCreated: vi.fn(),
			emitTaskUpdated: vi.fn(),
			emitTaskDeleted: vi.fn(),
			// ... 8 autres méthodes
		};

		mockTaskManager = {
			getAllTasks: vi.fn().mockReturnValue([]),
			getTask: vi.fn(),
			addTask: vi.fn(),
			// ... 5 autres méthodes
		};

		app = createRestAPI(mockTaskManager, mockWorkerManager, mockStateManager);
	});

	describe('GET /api/tasks', () => {
		it('should return all tasks', async () => {
			const response = await request(app).get('/api/tasks');
			expect(response.status).toBe(200);
		});

		it('should handle errors', async () => {
			mockTaskManager.getAllTasks.mockImplementation(() => {
				throw new Error('DB error');
			});
			const response = await request(app).get('/api/tasks');
			expect(response.status).toBe(500);
		});
	});

	describe('GET /api/tasks/:id', () => {
		it('should return task by id', async () => {
			mockTaskManager.getTask.mockReturnValue({ id: '123' });
			const response = await request(app).get('/api/tasks/123');
			expect(response.status).toBe(200);
		});

		it('should return 404 if not found', async () => {
			mockTaskManager.getTask.mockReturnValue(undefined);
			const response = await request(app).get('/api/tasks/123');
			expect(response.status).toBe(404);
		});
	});

	// ... 90 autres tests similaires
});
```

**Total: ~1000 lignes avec duplication massive**

#### ✅ Après (avec test-utils)

```typescript
import { createMockStateManager, createMockTaskManager, setupTest, testCRUDEndpoint } from '../test-utils';

describe('Task Management API', () => {
	let cleanup: () => void;
	let mockTaskManager: ReturnType<typeof createMockTaskManager>;
	let mockStateManager: ReturnType<typeof createMockStateManager>;
	let app: Express;

	beforeEach(() => {
		cleanup = setupTest();
		mockTaskManager = createMockTaskManager();
		mockStateManager = createMockStateManager();
		app = createRestAPI(mockTaskManager, mockWorkerManager, mockStateManager);
	});

	afterEach(() => {
		cleanup();
	});

	testCRUDEndpoint({
		app,
		request,
		basePath: '/api/tasks',
		mocks: {
			list: mockTaskManager.getAllTasks,
			get: mockTaskManager.getTask,
			create: mockTaskManager.addTask,
			update: mockTaskManager.updateTask,
			delete: mockTaskManager.deleteTask,
		},
	});
});
```

**Total: ~40 lignes**

**Gain: 1000 → 40 lignes = -96% de code!** 🎉🎉🎉

---

## Cheat Sheet

### Import Rapide

```typescript
// Setup basique
import { setupTest } from '../test-utils';
// Mocks communs
import {
	createMockFlowExecutor,
	createMockStateManager,
	createMockTaskManager,
	createMockWorkspaceManager,
} from '../test-utils';
// Factories
import { createMockFlow, createMockTask, createMockWorker, mockStepExecution } from '../test-utils';
// Helpers spéciaux
import { createTempTestDir, setupTimers, testEndpoint, waitForCondition } from '../test-utils';
```

### Remplacements Directs

| Avant                                | Après                        |
| ------------------------------------ | ---------------------------- |
| `vi.clearAllMocks()` + console mocks | `setupTest()`                |
| `vi.useFakeTimers()` + cleanup       | `setupTimers()`              |
| Mock TaskManager manuel              | `createMockTaskManager()`    |
| Mock StateManager manuel             | `createMockStateManager()`   |
| Mock FlowExecutor manuel             | `createMockFlowExecutor()`   |
| FlowDefinition complète              | `createMockFlow({ ... })`    |
| StepTrace complète                   | `mockStepExecution({ ... })` |
| Tests endpoint répétitifs            | `testEndpoint({ ... })`      |

---

## Anti-Patterns

### ❌ Anti-Pattern #1: Créer des Mocks Manuels

```typescript
// NON! Ce mock existe déjà dans test-utils
const mockTaskManager = {
	getAllTasks: vi.fn(),
	getTask: vi.fn(),
	// ...
};
```

**Solution**: Utiliser `createMockTaskManager()`

### ❌ Anti-Pattern #2: Dupliquer le Setup Console

```typescript
// NON! Utiliser setupTest() ou setupConsoleMocks()
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
```

**Solution**: Utiliser `setupTest()` qui fait tout automatiquement

### ❌ Anti-Pattern #3: Créer des FlowDefinition Complètes

```typescript
// NON! Trop verbeux et sujet aux erreurs
const flow: FlowDefinition = {
	id: 'test',
	version: '1.0.0',
	name: 'Test',
	description: 'Test',
	// ... 20 lignes
};
```

**Solution**: Utiliser `createMockFlow({ id: 'test' })`

### ❌ Anti-Pattern #4: Oublier le Cleanup

```typescript
// DANGEREUX! Les timers restent fake
beforeEach(() => {
	vi.useFakeTimers();
});
// Pas de afterEach avec vi.useRealTimers()
```

**Solution**: Utiliser `setupTimers()` qui garantit le cleanup

---

## Checklist de Migration

Quand vous migrez un fichier de test vers test-utils:

- [ ] Remplacer `vi.clearAllMocks()` + console par `setupTest()`
- [ ] Remplacer mock TaskManager par `createMockTaskManager()`
- [ ] Remplacer mock FlowExecutor par `createMockFlowExecutor()`
- [ ] Remplacer mock StateManager par `createMockStateManager()`
- [ ] Remplacer FlowDefinition par `createMockFlow()`
- [ ] Remplacer StepTrace par `mockStepExecution()`
- [ ] Remplacer fake timers par `setupTimers()`
- [ ] Utiliser `testEndpoint()` pour tests REST API
- [ ] Vérifier que tous les tests passent
- [ ] Supprimer les mocks manuels devenus inutiles

---

## Métriques de Succès

Après migration d'un fichier:

- **-50% à -90% de lignes de code** selon le fichier
- **0 tests cassés** (tous passent)
- **Lisibilité améliorée** (focus sur la logique, pas le setup)
- **Maintenance facilitée** (1 endroit pour modifier les mocks)

---

## Ressources

- **Code source test-utils**: `src/test-utils/`
- **Exemples réels**: Voir `MetricsCollector.test.ts` (excellent exemple)
- **Audit complet**: `.claude/docs/test-audit-final-report.md`
- **Guide rapide**: `.claude/docs/test-utils-guide.md`

---

**Date de création**: 2025-12-16
**Dernière mise à jour**: 2025-12-16
**Auteur**: Audit de qualité des tests - Agent Fleet
