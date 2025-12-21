# Guide Rapide des Test Utils

Guide de référence rapide pour utiliser les utilitaires de test dans Agent Fleet.

---

## 📦 Import

```typescript
// Import depuis le point d'entrée centralisé
import {
	MockChildProcess,
	MockFlowRegistry, // Mocks
	MockIssueCollector,
	MockWebSocket,
	createConsoleMocks,
	createMockFlow,
	createMockFlowResult,
	createMockFlowTrace,
	createMockStepTrace, // Factories
	createMockTask,
	createMockWorker,
	createMockWorkspace,
	createTempTestDir, // Helpers
	setupTimers,
	waitForCondition,
} from '../test-utils';
```

---

## 🏭 Factories

### Task Factory

```typescript
// Création simple
const task = createMockTask();

// Avec overrides
const task = createMockTask({
  id: 'custom-id',
  flowId: 'my-flow',
  priority: 'high',
  status: 'in-progress'
});

// Batch creation
const tasks = createMockTasks(5); // Crée 5 tasks avec IDs séquentiels
const tasks = createMockTasks(3, { priority: 'high' }); // Avec overrides
```

### Flow Factory

```typescript
// Création simple
const flow = createMockFlow();

// Avec overrides
const flow = createMockFlow({
  id: 'my-flow',
  name: 'My Custom Flow',
  steps: [
    createMockModelStep({ id: 'step1', prompt: 'Custom prompt' }),
    createMockScriptStep({ id: 'step2', script: 'echo "test"' }),
  ],
  workspace: {
    mode: 'shared',
    gitStrategy: 'main-only',
    reusePolicy: 'always'
  }
});
```

### Workspace Factory

```typescript
// Création simple
const workspace = createMockWorkspace();

// Avec overrides
const workspace = createMockWorkspace({
  id: 'ws-1',
  path: '/tmp/my-workspace',
  mode: 'shared'
});
```

### Step Factories

```typescript
// Model step
const modelStep = createMockModelStep({
	id: 'analyze',
	model: 'opus',
	prompt: 'Analyze this code',
});

// Script step
const scriptStep = createMockScriptStep({
	id: 'build',
	script: 'npm run build',
});

// SubFlow step
const subflowStep = createMockSubFlowStep({
	id: 'run-tests',
	flowId: 'test-flow',
	inputs: { suite: 'unit' },
});
```

---

## 🎭 Mocks

### MockIssueCollector

```typescript
describe('MyValidator', () => {
	let collector: MockIssueCollector;

	beforeEach(() => {
		collector = new MockIssueCollector();
	});

	it('should detect validation errors', () => {
		validator.validate(data, collector);

		// Assertions
		expect(collector.hasError()).toBe(true);
		expect(collector.hasCode(ValidationCode.INVALID_TYPE)).toBe(true);
		expect(collector.getErrors()).toHaveLength(2);
		expect(collector.getWarnings()).toHaveLength(1);

		const issue = collector.getIssueByCode(ValidationCode.INVALID_TYPE);
		expect(issue?.message).toContain('expected string');
	});

	it('should reset issues', () => {
		validator.validate(data, collector);
		expect(collector.issues).toHaveLength(3);

		collector.reset();
		expect(collector.issues).toHaveLength(0);
	});
});
```

### MockFlowRegistry

```typescript
describe('FlowLoader', () => {
	let registry: MockFlowRegistry;

	beforeEach(() => {
		registry = new MockFlowRegistry();

		// Add flows to registry
		registry.addFlow(createMockFlow({ id: 'flow-1' }));
		registry.addFlow(createMockFlow({ id: 'flow-2' }));
	});

	it('should find flow by id', () => {
		const flow = registry.getFlow('flow-1');
		expect(flow).toBeDefined();
		expect(flow?.id).toBe('flow-1');
	});

	it('should check flow existence', () => {
		expect(registry.hasFlow('flow-1')).toBe(true);
		expect(registry.hasFlow('non-existent')).toBe(false);
	});

	it('should list all flows', () => {
		const flows = registry.getAllFlows();
		expect(flows).toHaveLength(2);
	});
});
```

### MockWebSocket

```typescript
describe('WebSocketClient', () => {
	let ws: MockWebSocket;

	beforeEach(() => {
		ws = new MockWebSocket('ws://localhost:3738');
	});

	it('should send messages', () => {
		client.connect(ws as any);
		client.sendMessage({ type: 'ping' });

		expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
	});

	it('should receive messages', () => {
		client.connect(ws as any);

		// Simulate receiving message
		ws.simulateMessage({ type: 'pong' });

		expect(client.lastMessage).toEqual({ type: 'pong' });
	});

	it('should handle connection', () => {
		client.connect(ws as any);

		ws.simulateOpen();
		expect(client.isConnected()).toBe(true);

		ws.simulateClose();
		expect(client.isConnected()).toBe(false);
	});

	it('should handle errors', () => {
		client.connect(ws as any);

		ws.simulateError(new Error('Connection failed'));
		expect(client.lastError?.message).toBe('Connection failed');
	});
});
```

### MockChildProcess

```typescript
describe('ScriptRunner', () => {
	let mockProcess: MockChildProcess;

	beforeEach(() => {
		mockProcess = new MockChildProcess(12345);
		vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
	});

	it('should capture stdout', async () => {
		const promise = runner.execute('echo "test"');

		mockProcess.simulateStdout('test\n');
		mockProcess.simulateClose(0);

		const result = await promise;
		expect(result.stdout).toBe('test');
	});

	it('should handle errors', async () => {
		const promise = runner.execute('invalid-command');

		mockProcess.simulateError(new Error('Command not found'));

		await expect(promise).rejects.toThrow('Command not found');
	});
});
```

### Console Mocks

```typescript
describe('Logger', () => {
	let consoleMocks: ReturnType<typeof createConsoleMocks>;

	beforeEach(() => {
		consoleMocks = createConsoleMocks();
	});

	afterEach(() => {
		consoleMocks.restore();
	});

	it('should log messages', () => {
		logger.info('Test message');

		expect(consoleMocks.log).toHaveBeenCalledWith('Test message');
	});

	it('should log errors', () => {
		logger.error('Error occurred');

		expect(consoleMocks.error).toHaveBeenCalledWith('Error occurred');
	});
});
```

---

## 🛠️ Helpers

### Timer Management

```typescript
describe('ScheduledTask', () => {
	let cleanupTimers: () => void;

	beforeEach(() => {
		cleanupTimers = setupTimers();
	});

	afterEach(() => {
		cleanupTimers();
	});

	it('should execute after delay', () => {
		scheduler.scheduleTask(() => {
			executed = true;
		}, 1000);

		expect(executed).toBe(false);

		vi.advanceTimersByTime(1000);
		expect(executed).toBe(true);
	});
});
```

### Temporary Directories

```typescript
describe('FileProcessor', () => {
	it('should process files in temp dir', async () => {
		const { path, cleanup } = await createTempTestDir('processor-');

		try {
			// Use temp directory
			await fs.promises.writeFile(`${path}/test.txt`, 'content');
			const result = await processor.process(path);

			expect(result).toBe('processed');
		} finally {
			await cleanup();
		}
	});
});
```

### Async Condition Waiting

```typescript
describe('AsyncOperations', () => {
	it('should wait for condition', async () => {
		let ready = false;

		setTimeout(() => {
			ready = true;
		}, 100);

		await waitForCondition(() => ready, { timeout: 1000, interval: 10 });

		expect(ready).toBe(true);
	});

	it('should timeout if condition not met', async () => {
		await expect(waitForCondition(() => false, { timeout: 100, message: 'Never ready' })).rejects.toThrow(
			'Never ready (timeout after 100ms)'
		);
	});
});
```

### Environment Variables

```typescript
describe('EnvReader', () => {
	it('should read custom env vars', () => {
		const restore = mockEnvVars({
			NODE_ENV: 'test',
			API_KEY: 'test-key',
		});

		try {
			expect(process.env.NODE_ENV).toBe('test');
			expect(reader.getApiKey()).toBe('test-key');
		} finally {
			restore();
		}
	});
});
```

### Console Output Capture

```typescript
describe('Reporter', () => {
	it('should capture console output', async () => {
		const { result, stdout, stderr } = await captureConsoleOutput(() => {
			console.log('Info message');
			console.error('Error message');
			return 'result';
		});

		expect(result).toBe('result');
		expect(stdout).toEqual(['Info message']);
		expect(stderr).toEqual(['Error message']);
	});
});
```

### Async Error Assertions

```typescript
describe('ErrorHandling', () => {
	it('should throw specific error', async () => {
		const error = await assertThrowsAsync(async () => {
			await riskyOperation();
		}, /connection failed/i);

		expect(error.message).toContain('connection failed');
	});
});
```

### Deferred Promises

```typescript
describe('AsyncCoordination', () => {
	it('should coordinate async operations', async () => {
		const { promise, resolve } = createDeferred<string>();

		setTimeout(() => resolve('done'), 100);

		const result = await promise;
		expect(result).toBe('done');
	});
});
```

### Retry Logic

```typescript
describe('NetworkRequests', () => {
	it('should retry on failure', async () => {
		let attempts = 0;

		const result = await retry(
			async () => {
				attempts++;
				if (attempts < 3) throw new Error('Temporary failure');
				return 'success';
			},
			{
				maxAttempts: 5,
				delay: 100,
				backoff: 'exponential',
			}
		);

		expect(result).toBe('success');
		expect(attempts).toBe(3);
	});
});
```

---

## 🎯 Patterns Communs

### Test avec Setup Complet

```typescript
import { MockIssueCollector, createMockFlow, createMockTask, setupConsoleMocks, setupTimers } from '../test-utils';

describe('CompleteFeature', () => {
	let task: Task;
	let flow: FlowDefinition;
	let collector: MockIssueCollector;
	let cleanupTimers: () => void;
	let consoleMocks: ReturnType<typeof setupConsoleMocks>;

	beforeEach(() => {
		// Setup
		task = createMockTask({ flowId: 'test-flow' });
		flow = createMockFlow({ id: 'test-flow' });
		collector = new MockIssueCollector();
		cleanupTimers = setupTimers();
		consoleMocks = setupConsoleMocks();
	});

	afterEach(() => {
		// Cleanup
		cleanupTimers();
		consoleMocks.restore();
	});

	it('should work correctly', async () => {
		// Test implementation
	});
});
```

### Test d'Intégration avec Temp Dir

```typescript
import { createMockFlow, createTempTestDir } from '../test-utils';

describe('FlowPersistence', () => {
	it('should save and load flows', async () => {
		const { path, cleanup } = await createTempTestDir('flows-');

		try {
			const flow = createMockFlow();

			await persistence.save(path, flow);
			const loaded = await persistence.load(path, flow.id);

			expect(loaded).toEqual(flow);
		} finally {
			await cleanup();
		}
	});
});
```

### Test avec WebSocket Mock

```typescript
import { MockWebSocket, createMockTask } from '../test-utils';

describe('WorkerClient', () => {
	let ws: MockWebSocket;

	beforeEach(() => {
		ws = new MockWebSocket('ws://test');
		client = new WorkerClient(ws as any);
	});

	it('should handle task assignment', () => {
		ws.simulateOpen();

		const task = createMockTask();
		ws.simulateMessage({ type: 'assign_task', task });

		expect(client.currentTask).toEqual(task);
	});
});
```

---

## 💡 Tips

### 1. Préférer les Overrides Minimaux

```typescript
// ✅ Bon - Override uniquement ce qui est nécessaire
const task = createMockTask({ flowId: 'custom' });

// ❌ Moins bon - Override trop de champs
const task = createMockTask({
  flowId: 'custom',
  priority: 'medium',  // Déjà la valeur par défaut
  metadata: {},        // Déjà la valeur par défaut
});
```

### 2. Utiliser les Batch Factories

```typescript
// ✅ Bon - Batch creation
const tasks = createMockTasks(10, { priority: 'high' });

// ❌ Moins bon - Manual creation
const tasks = [
  createMockTask({ id: 'task-1', priority: 'high' }),
  createMockTask({ id: 'task-2', priority: 'high' }),
  // ...
];
```

### 3. Cleanup Systématique

```typescript
describe('MyTests', () => {
	let cleanup: () => void;

	afterEach(() => {
		// Toujours cleanup dans afterEach
		if (cleanup) cleanup();
	});

	it('should test something', async () => {
		const { path, cleanup: cleanupDir } = await createTempTestDir();
		cleanup = cleanupDir;

		// Test logic
	});
});
```

### 4. Nommer les Mocks Clairement

```typescript
// ✅ Bon
const mockExecutor = createMockFlowExecutor();
const consoleMocks = createConsoleMocks();

// ❌ Moins bon
const executor = createMockFlowExecutor(); // Confus avec le vrai
const mocks = createConsoleMocks(); // Trop vague
```

---

## 📚 Ressources

- **Code Source**: `src/test-utils/`
- **Rapport Complet**: `.claude/docs/test-refactoring-report.md`
- **Conventions**: `CLAUDE.md`

---

_Dernière mise à jour: 2025-12-15_
