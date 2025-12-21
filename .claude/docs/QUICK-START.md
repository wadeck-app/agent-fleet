# Test Utils - Quick Start Guide

**Démarrage rapide** pour utiliser les utilitaires de test dans Agent Fleet.

---

## 🚀 Import

```typescript
import {
	MockChildProcess,
	MockFlowRegistry, // Mocks (classes mock réutilisables)
	MockIssueCollector,
	createMockFlow, // Factories (créer des données de test)
	createMockTask,
	createMockWorker,
	createMockWorkspace,
	createTempTestDir, // Helpers (fonctions d'aide)
	setupTimers,
	waitForCondition,
} from '../test-utils';
```

---

## 📦 Factories

### Créer une Task

```typescript
// Simple
const task = createMockTask();

// Avec overrides
const task = createMockTask({
  id: 'my-task',
  priority: 'high',
  status: 'in-progress',
});

// Batch
const tasks = createMockTasks(5); // 5 tasks avec IDs séquentiels
const tasks = createMockTasks(3, { priority: 'high' }); // Avec overrides
```

### Créer un Flow

```typescript
const flow = createMockFlow({
	id: 'my-flow',
	steps: [createMockModelStep({ prompt: 'Analyze this' }), createMockScriptStep({ script: 'npm test' })],
});
```

### Créer un Workspace

```typescript
const workspace = createMockWorkspace({
	mode: 'shared',
	path: '/custom/path',
});
```

---

## 🎭 Mocks

### MockIssueCollector (Validation)

```typescript
describe('Validator', () => {
	let collector: MockIssueCollector;

	beforeEach(() => {
		collector = new MockIssueCollector();
	});

	it('should detect errors', () => {
		validator.validate(data, collector);

		expect(collector.hasError()).toBe(true);
		expect(collector.hasCode(ValidationCode.INVALID_TYPE)).toBe(true);
	});
});
```

### MockFlowRegistry

```typescript
const registry = new MockFlowRegistry();
registry.addFlow(createMockFlow({ id: 'flow-1' }));

expect(registry.hasFlow('flow-1')).toBe(true);
```

### MockChildProcess

```typescript
const mockProcess = new MockChildProcess();

// Simuler output
mockProcess.simulateStdout('Hello\\n');
mockProcess.simulateClose(0);

// Simuler erreur
mockProcess.simulateError(new Error('Failed'));
```

---

## 🛠️ Helpers

### Timer Management

```typescript
describe('MyTests', () => {
	let cleanupTimers: () => void;

	beforeEach(() => {
		cleanupTimers = setupTimers();
	});

	afterEach(() => {
		cleanupTimers();
	});

	it('should wait', () => {
		setTimeout(() => {
			done = true;
		}, 1000);
		vi.advanceTimersByTime(1000);
		expect(done).toBe(true);
	});
});
```

### Temporary Directory

```typescript
it('should process files', async () => {
	const { path, cleanup } = await createTempTestDir('test-');

	try {
		await fs.promises.writeFile(`${path}/file.txt`, 'content');
		// ... test logic ...
	} finally {
		await cleanup();
	}
});
```

### Wait for Condition

```typescript
it('should become ready', async () => {
	let ready = false;
	setTimeout(() => {
		ready = true;
	}, 100);

	await waitForCondition(() => ready, { timeout: 1000 });

	expect(ready).toBe(true);
});
```

---

## 📋 Patterns Communs

### Test Complet

```typescript
import { MockIssueCollector, createMockTask, createTempTestDir, setupTimers } from '../test-utils';

describe('CompleteFeature', () => {
	let cleanupTimers: () => void;
	let collector: MockIssueCollector;
	let tempDir: { path: string; cleanup: () => Promise<void> };

	beforeEach(async () => {
		cleanupTimers = setupTimers();
		collector = new MockIssueCollector();
		tempDir = await createTempTestDir('feature-');
	});

	afterEach(async () => {
		cleanupTimers();
		await tempDir.cleanup();
	});

	it('should work', async () => {
		const task = createMockTask({ priority: 'high' });
		// ... test implementation ...
		expect(collector.hasError()).toBe(false);
	});
});
```

### Validation Test

```typescript
import { MockIssueCollector } from '../../test-utils';

describe('MyValidator', () => {
	let collector: MockIssueCollector;

	beforeEach(() => {
		collector = new MockIssueCollector();
	});

	it('should validate', () => {
		validator.validate(data, collector);

		expect(collector.hasError()).toBe(false);
		expect(collector.issues).toHaveLength(0);
	});
});
```

### Flow Test

```typescript
import { createMockFlow, createMockModelStep } from '../../test-utils';

describe('FlowExecution', () => {
	it('should execute', async () => {
		const flow = createMockFlow({
			steps: [createMockModelStep({ id: 'step1', prompt: 'Test' })],
		});

		const result = await executor.execute(flow);

		expect(result.success).toBe(true);
	});
});
```

---

## 💡 Tips

### 1. Override Minimal

```typescript
// ✅ Bon
const task = createMockTask({ priority: 'high' });

// ❌ Trop
const task = createMockTask({
  priority: 'high',
  status: 'pending', // déjà la valeur par défaut
  metadata: {},       // déjà la valeur par défaut
});
```

### 2. Cleanup Systématique

```typescript
// ✅ Toujours cleanup
afterEach(() => {
	if (cleanupTimers) cleanupTimers();
	if (tempDir) tempDir.cleanup();
});
```

### 3. Nommer Clairement

```typescript
// ✅ Clair
const mockExecutor = createMockFlowExecutor();

// ❌ Confus
const executor = createMockFlowExecutor();
```

---

## 📚 Documentation Complète

- **Guide de Référence**: `.claude/docs/test-utils-guide.md`
- **Rapport Détaillé**: `.claude/docs/test-refactoring-report.md`
- **Rapport Final**: `.claude/docs/test-audit-final-report.md`

---

## ✅ Checklist Nouveau Test

- [ ] Importer depuis `test-utils`
- [ ] Utiliser `setupTimers()` si besoin de fake timers
- [ ] Utiliser factories plutôt que créer manuellement
- [ ] Cleanup dans `afterEach`
- [ ] Nommer clairement les mocks
- [ ] Tester et vérifier que ça passe

---

**Besoin d'aide?** Consultez les exemples dans les tests existants:

- `src/flow/validation/*.test.ts` - Exemples de validation
- `src/shared/Storage.test.ts` - Exemples avec filesystem
- `src/orchestrator/metrics/MetricsCollector.test.ts` - Exemples avec timers

---

_Dernière mise à jour: 2025-12-15_
