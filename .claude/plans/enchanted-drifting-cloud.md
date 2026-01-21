# Plan: Éliminer la duplication des logs et garantir l'ordre correct

## PRIORITIZATION (User Instruction)

**USER EXPLICIT INSTRUCTION**: "Histoire de valider que le systeme de orderId/timestamp fonctionne, je veux que tu implementes ca, que tu le test, AVANT de corriger les duplication d'events"

**Implementation Order**:

1. **FIRST**: Implement Phase 2 (Sequence Number System) - Lines 248-406
2. **Test thoroughly** with controlledPromise tests
3. **THEN**: Implement Phase 1 (Root Cause Fixes) - Lines 108-244

This validates the ordering mechanism works correctly before touching event subscriptions.

---

## Résumé Exécutif

Les logs apparaissent 2-3 fois dans l'UI à cause de **3 root causes distinctes**:

1. **ROOT CAUSE #1 (PRIMAIRE)**: Double subscription dans TaskDetailStackedPage - `appendNewLogs()` est appelé 2 fois
2. **ROOT CAUSE #2 (SECONDAIRE)**: Pas de déduplication dans useTaskLogs - les mêmes logs sont ajoutés plusieurs fois
3. **ROOT CAUSE #3 (TERTIAIRE)**: TraceChunkStorage peut écrire la même trace plusieurs fois si le worker envoie des duplicatas

**Solution**:

- Ajouter un système de séquences globales pour garantir l'ordre correct et détecter les logs manquants/en retard (PHASE 2 - DO FIRST)
- Corriger les 3 root causes pour éliminer les duplications à la source (PHASE 1 - DO AFTER VALIDATION)

---

## Root Causes - Analyse Détaillée

### Root Cause #1: Double Event Subscription (PRIMAIRE)

**Fichier**: `packages/web-frontend/src/app/pages/tasks/TaskDetailStackedPage.tsx:62-79`

```typescript
// Subscription 1 - Trace updates
useRealtimeRefresh({
	events: [B2F_TASK_TRACE_UPDATED],
	onEvent: appendNewLogs, // ✅ Fetch des nouveaux logs
	filters: { taskId },
});

// Subscription 2 - Task updates
useRealtimeRefresh({
	events: [B2F_TASK_UPDATED],
	onEvent: () => {
		refetchTask();
		appendNewLogs(); // ❌ FETCH À NOUVEAU les mêmes logs!
	},
	filters: { taskId },
});
```

**Pourquoi ça cause des duplications**:

1. Quand une trace arrive, le backend broadcast `B2F_TASK_TRACE_UPDATED`
2. Le backend peut aussi broadcaster `B2F_TASK_UPDATED` (changement de statut)
3. Subscription 1 appelle `appendNewLogs()` → fetch logs [1,2,3]
4. Subscription 2 appelle `appendNewLogs()` → fetch logs [1,2,3] À NOUVEAU
5. Sans déduplication, les logs [1,2,3] apparaissent en double

**Même fichier**: `packages/web-frontend/src/app/pages/tasks/TaskDetailSplitPage.tsx:62-79` (code identique)

### Root Cause #2: Pas de déduplication dans useTaskLogs (SECONDAIRE)

**Fichier**: `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.ts:124`

```typescript
const appendNewLogs = useCallback(async () => {
	const response = await tasksApi.getTaskLogs(taskId, {
		cursor: logs.length,
		limit,
	});

	if (response.logs.length > 0) {
		setLogs(prevLogs => [...prevLogs, ...response.logs]); // ❌ Concaténation aveugle!
	}
}, [taskId, logs.length, limit]);
```

**Pourquoi ça cause des duplications**:

- Si `appendNewLogs()` est appelé 2 fois rapidement (root cause #1)
- Les deux appels API peuvent retourner les mêmes logs (curseur identique)
- Pas de vérification → les logs sont ajoutés 2 fois

### Root Cause #3: TraceChunkStorage peut écrire des duplicatas (TERTIAIRE)

**Fichier**: `packages/orchestrator/src/core/TraceChunkStorage.ts:64-106`

```typescript
async writeTraceIncremental(taskId: string, trace: any): Promise<void> {
  const steps = trace.steps || [];
  const metadata = await this.loadMetadata(taskId);

  const existingCount = metadata?.totalEntries || 0;
  const newSteps = steps.slice(existingCount);  // ⚠️ Suppose que steps est TOUJOURS cumulatif

  if (newSteps.length === 0) {
    return; // OK si c'est vraiment un duplicata
  }

  // ... écriture des chunks

  await this.updateMetadata(taskId, steps.length);  // ⚠️ Utilise steps.length au lieu de existingCount + newSteps.length
}
```

**Problème potentiel**:

- Si le worker envoie la même trace deux fois de suite, `newSteps.length === 0` et on return (OK)
- MAIS si les traces arrivent dans le désordre ou avec des trous, le compteur peut être incorrect
- Ligne 105: `updateMetadata(taskId, steps.length)` utilise le total reçu, pas le total écrit réellement

---

## Plan de Correction

### Phase 1: Corriger les Root Causes

#### 1.1 Éliminer la double subscription (ROOT CAUSE #1)

**Fichiers à modifier**:

- `packages/web-frontend/src/app/pages/tasks/TaskDetailStackedPage.tsx`
- `packages/web-frontend/src/app/pages/tasks/TaskDetailSplitPage.tsx`

**Changement**:

```typescript
// AVANT (ligne 71-79)
useRealtimeRefresh({
	events: [B2F_TASK_UPDATED],
	onEvent: () => {
		refetchTask();
		appendNewLogs(); // ❌ À SUPPRIMER
	},
	filters: { taskId },
});

// APRÈS
useRealtimeRefresh({
	events: [B2F_TASK_UPDATED],
	onEvent: refetchTask, // ✅ Seulement refetch task metadata, pas les logs
	filters: { taskId },
	logPrefix: 'TaskDetail:task',
});
```

**Rationale**: `B2F_TASK_TRACE_UPDATED` gère déjà les mises à jour de logs. `B2F_TASK_UPDATED` ne doit gérer QUE les changements de statut/metadata.

#### 1.2 Ajouter déduplication par ID dans useTaskLogs (ROOT CAUSE #2)

**Fichier**: `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.ts`

**Changements**:

```typescript
export function useTaskLogs({ taskId, level, search, limit = 100 }: UseTaskLogsOptions): UseTaskLogsResult {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [logIdSet, setLogIdSet] = useState<Set<string>>(new Set()); // ✅ NOUVEAU: Track IDs vus
	// ... autres états

	// ✅ NOUVEAU: Helper pour merger avec déduplication
	const mergeLogs = useCallback(
		(prevLogs: LogEntry[], newLogs: LogEntry[]): LogEntry[] => {
			const uniqueNewLogs = newLogs.filter(log => !logIdSet.has(log.id));

			if (uniqueNewLogs.length === 0) {
				console.log('[useTaskLogs] No new unique logs to add (all duplicates filtered)');
				return prevLogs;
			}

			// Update ID tracking
			uniqueNewLogs.forEach(log => logIdSet.add(log.id));

			console.log(
				`[useTaskLogs] Adding ${uniqueNewLogs.length} unique logs (filtered ${newLogs.length - uniqueNewLogs.length} duplicates)`
			);

			return [...prevLogs, ...uniqueNewLogs];
		},
		[logIdSet]
	);

	// Modifier appendNewLogs pour utiliser mergeLogs
	const appendNewLogs = useCallback(async () => {
		try {
			const response = await tasksApi.getTaskLogs(taskId, {
				cursor: logs.length,
				limit,
				level,
				search,
			});

			if (response.logs.length > 0) {
				setLogs(prevLogs => mergeLogs(prevLogs, response.logs)); // ✅ Utilise mergeLogs
			}
			// ... reste du code
		} catch (err) {
			console.error('Failed to append new logs:', err);
		}
	}, [taskId, logs.length, limit, level, search, mergeLogs]);

	// Reset ID set on initial fetch
	useEffect(() => {
		// ... fetch initial
		const idSet = new Set(response.logs.map(l => l.id));
		setLogIdSet(idSet);
		setLogs(response.logs);
		// ...
	}, [taskId, level, search, limit, refreshTrigger]);

	// ... reste du hook
}
```

**Note**: Cette déduplication par ID est un **filet de sécurité**. Avec la root cause #1 corrigée, elle ne devrait filtrer aucun duplicata en conditions normales.

#### 1.3 Sécuriser TraceChunkStorage contre écritures multiples (ROOT CAUSE #3)

**Fichier**: `packages/orchestrator/src/core/TraceChunkStorage.ts`

**Changement ligne 105**:

```typescript
// AVANT
await this.updateMetadata(taskId, steps.length); // ❌ Utilise le total reçu

// APRÈS
await this.updateMetadata(taskId, existingCount + newSteps.length); // ✅ Utilise le total réellement écrit
```

**Ajouter aussi un log de debug**:

```typescript
async writeTraceIncremental(taskId: string, trace: any): Promise<void> {
  const steps = trace.steps || [];
  const metadata = await this.loadMetadata(taskId);

  const existingCount = metadata?.totalEntries || 0;
  const newSteps = steps.slice(existingCount);

  if (newSteps.length === 0) {
    console.log(`[TraceChunkStorage] No new steps for task ${taskId} (received ${steps.length}, existing ${existingCount})`);
    return;
  }

  console.log(`[TraceChunkStorage] Writing ${newSteps.length} new steps for task ${taskId} (total: ${existingCount} → ${existingCount + newSteps.length})`);

  // ... reste du code

  await this.updateMetadata(taskId, existingCount + newSteps.length);  // ✅ Utilise le total écrit
}
```

---

### Phase 2: Ajouter système de séquences pour ordre garanti

#### 2.1 Ajouter numéros de séquence aux logs

**Objectif**: Garantir que les logs apparaissent toujours dans le bon ordre, même s'ils arrivent en retard.

**Fichier**: `packages/shared-frontend-backend/src/api/tasks.contract.ts`

**Modifications**:

```typescript
export const LogEntrySchema = z.object({
	id: z.string(),
	sequence: z.number().int().min(0), // ✅ NOUVEAU: Numéro de séquence global
	timestamp: z.number(),
	level: LogLevelSchema,
	message: z.string(),
	stepId: z.string(),
	stepName: z.string(),
	stepType: z.enum(['model', 'script', 'subflow', 'constant', 'user_intervention']),
	metadata: z.record(z.string(), z.any()).optional(),
});

export const PaginatedLogsResponseSchema = z.object({
	logs: z.array(LogEntrySchema),
	nextCursor: z.number().nullable(),
	total: z.number(),
	isRunning: z.boolean(),
	minSequence: z.number().int().min(0), // ✅ NOUVEAU: Plus petit sequence dans cette réponse
	maxSequence: z.number().int().min(0), // ✅ NOUVEAU: Plus grand sequence dans cette réponse
});
```

#### 2.2 Générer séquences dans TasksService

**Fichier**: `packages/web-backend/src/services/TasksService.ts:578-649`

**Changements**:

```typescript
async getTaskLogs(taskId: string, query: PaginatedLogsQuery): Promise<PaginatedLogsResponse> {
  // ... existing code to get steps

  let allLogs: LogEntry[] = [];
  let minSeq = Infinity;
  let maxSeq = -1;

  steps.forEach((step: any, globalStepIndex: number) => {
    // Chaque step a un index global dans la trace
    // Base sequence = globalStepIndex * 10 (laisse de la place pour sub-entries)
    let currentSeq = globalStepIndex * 10;

    // Main log entry
    const stepLog: LogEntry = {
      id: `${taskId}-${currentSeq}`,  // ✅ ID déterministe: taskId + sequence
      sequence: currentSeq++,          // ✅ Séquence globale
      timestamp: step.startTime,
      level: this.inferLogLevel(step),
      message: this.formatStepMessage(step),
      stepId: step.stepId,
      stepName: step.stepName,
      stepType: step.stepType,
      metadata: { durationMs: step.durationMs, model: step.model, exitCode: step.exitCode },
    };
    allLogs.push(stepLog);

    // Sub-entries avec séquences incrémentales
    if (step.prompt) {
      allLogs.push({
        id: `${taskId}-${currentSeq}`,
        sequence: currentSeq++,
        timestamp: step.startTime + 1,
        level: 'debug' as LogLevel,
        message: `Prompt: ${step.prompt.substring(0, 200)}...`,
        stepId: step.stepId,
        stepName: step.stepName,
        stepType: step.stepType,
        metadata: { fullPrompt: step.prompt },
      });
    }

    // Similar pour response, stdout, stderr avec currentSeq++

    minSeq = Math.min(minSeq, globalStepIndex * 10);
    maxSeq = Math.max(maxSeq, currentSeq - 1);
  });

  // Apply filters...

  return {
    logs: allLogs,
    nextCursor: stepsCursor,
    total: stepsTotal,
    isRunning,
    minSequence: minSeq === Infinity ? 0 : minSeq,
    maxSequence: maxSeq === -1 ? 0 : maxSeq,
  };
}
```

**Rationale pour l'espacement par 10**:

- Step 0: sequences 0-9
- Step 1: sequences 10-19
- Step 2: sequences 20-29
- Permet d'insérer jusqu'à 10 sub-logs par step sans collision

#### 2.3 Trier logs par séquence dans useTaskLogs

**Fichier**: `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.ts`

**Amélioration du mergeLogs**:

```typescript
const mergeLogs = useCallback(
	(prevLogs: LogEntry[], newLogs: LogEntry[]): LogEntry[] => {
		// Filter duplicates
		const uniqueNewLogs = newLogs.filter(log => !logIdSet.has(log.id));

		if (uniqueNewLogs.length === 0) {
			return prevLogs;
		}

		// Update ID tracking
		uniqueNewLogs.forEach(log => logIdSet.add(log.id));

		// ✅ NOUVEAU: Merge et trier par séquence
		const merged = [...prevLogs, ...uniqueNewLogs];
		merged.sort((a, b) => a.sequence - b.sequence);

		// ✅ NOUVEAU: Détecter les trous dans les séquences
		const sequences = merged.map(l => l.sequence);
		const gaps: number[] = [];
		for (let i = 1; i < sequences.length; i++) {
			const gap = sequences[i] - sequences[i - 1];
			if (gap > 1) {
				gaps.push(sequences[i - 1]);
				console.warn(
					`[useTaskLogs] Sequence gap detected: ${sequences[i - 1]} → ${sequences[i]} (missing ${gap - 1} logs)`
				);
			}
		}

		console.log(
			`[useTaskLogs] Merged ${uniqueNewLogs.length} unique logs. Total: ${merged.length}. Sequence gaps: ${gaps.length}`
		);

		return merged;
	},
	[logIdSet]
);
```

**Bénéfices**:

1. Si un log arrive en retard, il est inséré à la bonne position (tri par sequence)
2. Les trous de séquence sont détectés et loggés (peut indiquer des logs perdus)
3. L'ordre est TOUJOURS correct, même en cas d'arrivée désordonnée

---

### Phase 3: Tests Complets avec controlledPromise

#### 3.1 Utilitaires de test

**Créer**: `packages/web-frontend/src/test/utils/asyncUtils.ts`

```typescript
/**
 * Crée une promise contrôlable pour tester les race conditions
 */
export function createControlledPromise<T>() {
	let resolveFunc: (value: T) => void;
	let rejectFunc: (error: any) => void;

	const promise = new Promise<T>((resolve, reject) => {
		resolveFunc = resolve;
		rejectFunc = reject;
	});

	return {
		promise,
		resolve: resolveFunc!,
		reject: rejectFunc!,
	};
}

/**
 * Mock API avec timing contrôlé
 */
export function createMockTasksApi() {
	const pendingCalls: Array<{ resolve: Function; reject: Function }> = [];

	const api = {
		getTaskLogs: vi.fn((taskId: string, query: any) => {
			const controlled = createControlledPromise<PaginatedLogsResponse>();
			pendingCalls.push(controlled);
			return controlled.promise;
		}),

		resolveNext: (response: PaginatedLogsResponse) => {
			if (pendingCalls.length === 0) throw new Error('No pending calls');
			const next = pendingCalls.shift()!;
			next.resolve(response);
		},

		resolveAll: (response: PaginatedLogsResponse) => {
			while (pendingCalls.length > 0) {
				api.resolveNext(response);
			}
		},

		getPendingCount: () => pendingCalls.length,
	};

	return api;
}
```

#### 3.2 Tests critiques

**Créer**: `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.deduplication.test.ts`

```typescript
describe('useTaskLogs - Deduplication Tests', () => {
	let mockApi: ReturnType<typeof createMockTasksApi>;

	beforeEach(() => {
		mockApi = createMockTasksApi();
		vi.mock('../tasks.api', () => ({ tasksApi: mockApi }));
	});

	describe('double event scenario (root cause #1)', () => {
		it('should deduplicate when appendNewLogs is called twice rapidly', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Initial load
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalledTimes(1));
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 1,
				isRunning: true,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(1));

			// Simulate double event: B2F_TASK_TRACE_UPDATED + B2F_TASK_UPDATED
			const append1 = result.current.appendNewLogs();
			const append2 = result.current.appendNewLogs();

			// Both fetch in parallel
			await waitFor(() => expect(mockApi.getPendingCount()).toBe(2));

			// Both return SAME logs (simulating duplicate fetch)
			const duplicateLogs = {
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 10,
				maxSequence: 10,
			};

			mockApi.resolveNext(duplicateLogs);
			mockApi.resolveNext(duplicateLogs);

			await Promise.all([append1, append2]);

			// Should have 2 unique logs, NOT 3
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(2);
				expect(result.current.logs.map(l => l.id)).toEqual(['task-1-0', 'task-1-10']);
			});
		});
	});

	describe('out-of-order arrival', () => {
		it('should insert late logs in correct sequence position', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Load with gap: sequences 0, 10, 30 (missing 20)
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
					{
						id: 'task-1-30',
						sequence: 30,
						message: 'Log 30',
						timestamp: 400,
						level: 'info',
						stepId: 's4',
						stepName: 'S4',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 0,
				maxSequence: 30,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(3));

			// Late arrival: sequence 20
			result.current.appendNewLogs();
			await waitFor(() => expect(mockApi.getPendingCount()).toBe(1));

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 4,
				isRunning: true,
				minSequence: 20,
				maxSequence: 20,
			});

			// Should be inserted between 10 and 30
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(4);
				expect(result.current.logs.map(l => l.sequence)).toEqual([0, 10, 20, 30]);
				expect(result.current.logs[2].message).toBe('Log 20');
			});
		});
	});

	describe('concurrent calls', () => {
		it('should handle 3 concurrent appendNewLogs without duplicates', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Initial
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 1,
				isRunning: true,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(1));

			// 3 concurrent calls
			const promises = [
				result.current.appendNewLogs(),
				result.current.appendNewLogs(),
				result.current.appendNewLogs(),
			];

			await waitFor(() => expect(mockApi.getPendingCount()).toBe(3));

			// Resolve with overlapping data
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 10,
				maxSequence: 10,
			});

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 10,
				maxSequence: 20,
			});

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 20,
				maxSequence: 20,
			});

			await Promise.all(promises);

			// Should deduplicate: 0, 10, 20 (not 0, 10, 10, 20, 20)
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(3);
				expect(result.current.logs.map(l => l.id)).toEqual(['task-1-0', 'task-1-10', 'task-1-20']);
			});
		});
	});
});
```

#### 3.3 Tests backend

**Créer**: `packages/web-backend/src/services/TasksService.log-deduplication.test.ts`

```typescript
describe('TasksService - Deterministic Log IDs', () => {
	it('should generate unique IDs for repeated stepIds', async () => {
		const steps = [
			{ stepId: 'test', startTime: 100, stepName: 'Test', stepType: 'script' },
			{ stepId: 'implement', startTime: 200, stepName: 'Implement', stepType: 'script' },
			{ stepId: 'test', startTime: 300, stepName: 'Test', stepType: 'script' }, // Same stepId!
		];

		mockStorage.readLogsPaginated.mockResolvedValue({
			logs: steps,
			nextCursor: null,
			total: 3,
		});

		const result = await service.getTaskLogs('task-1', { cursor: 0, limit: 100 });

		// All IDs must be unique
		const ids = result.logs.map(l => l.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);

		// Sequences should be 0, 10, 20 (spaced by 10)
		expect(result.logs.map(l => l.sequence)).toEqual([0, 10, 20]);
	});

	it('should generate unique IDs for sub-entries', async () => {
		const steps = [
			{
				stepId: 'model',
				startTime: 100,
				stepName: 'Model',
				stepType: 'model',
				prompt: 'Test prompt',
				response: 'Test response',
				stdout: 'Test output',
			},
		];

		mockStorage.readLogsPaginated.mockResolvedValue({
			logs: steps,
			nextCursor: null,
			total: 1,
		});

		const result = await service.getTaskLogs('task-1', { cursor: 0, limit: 100 });

		// Expect: 1 main + 1 prompt + 1 response + 1 stdout = 4 logs
		expect(result.logs).toHaveLength(4);

		// All IDs unique
		const ids = result.logs.map(l => l.id);
		expect(new Set(ids).size).toBe(4);

		// Sequences should be 0, 1, 2, 3 (consecutive)
		expect(result.logs.map(l => l.sequence)).toEqual([0, 1, 2, 3]);
	});
});
```

#### 3.4 Test integration TraceChunkStorage

**Créer**: `packages/orchestrator/src/core/TraceChunkStorage.deduplication.test.ts`

```typescript
describe('TraceChunkStorage - Duplicate Write Protection', () => {
	it('should not duplicate steps when same trace is written twice', async () => {
		const taskId = 'test-task-1';

		// First write: 2 steps
		await storage.writeTraceIncremental(taskId, {
			steps: [
				{ stepId: 'step1', startTime: 100 },
				{ stepId: 'step2', startTime: 200 },
			],
		});

		// Second write: SAME 2 steps
		await storage.writeTraceIncremental(taskId, {
			steps: [
				{ stepId: 'step1', startTime: 100 },
				{ stepId: 'step2', startTime: 200 },
			],
		});

		// Should have 2 steps, not 4
		const metadata = await storage.loadMetadata(taskId);
		expect(metadata?.totalEntries).toBe(2);
	});

	it('should correctly handle incremental writes', async () => {
		const taskId = 'test-task-2';

		// First: 2 steps
		await storage.writeTraceIncremental(taskId, {
			steps: [
				{ stepId: 'step1', startTime: 100 },
				{ stepId: 'step2', startTime: 200 },
			],
		});

		// Second: 4 steps (includes previous 2)
		await storage.writeTraceIncremental(taskId, {
			steps: [
				{ stepId: 'step1', startTime: 100 },
				{ stepId: 'step2', startTime: 200 },
				{ stepId: 'step3', startTime: 300 },
				{ stepId: 'step4', startTime: 400 },
			],
		});

		// Should have 4 total (not 6)
		const metadata = await storage.loadMetadata(taskId);
		expect(metadata?.totalEntries).toBe(4);
	});
});
```

---

## Fichiers Critiques à Modifier

### Corrections des Root Causes (Phase 1)

1. **TaskDetailStackedPage.tsx** (`packages/web-frontend/src/app/pages/tasks/TaskDetailStackedPage.tsx:71-79`)
    - Supprimer `appendNewLogs()` de la subscription `B2F_TASK_UPDATED`

2. **TaskDetailSplitPage.tsx** (`packages/web-frontend/src/app/pages/tasks/TaskDetailSplitPage.tsx:71-79`)
    - Supprimer `appendNewLogs()` de la subscription `B2F_TASK_UPDATED`

3. **useTaskLogs.ts** (`packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.ts`)
    - Ajouter `logIdSet` state
    - Créer `mergeLogs()` helper avec déduplication par ID
    - Modifier `appendNewLogs()` pour utiliser `mergeLogs()`
    - Reset `logIdSet` dans le useEffect d'initialisation

4. **TraceChunkStorage.ts** (`packages/orchestrator/src/core/TraceChunkStorage.ts:105`)
    - Fix ligne 105: utiliser `existingCount + newSteps.length` au lieu de `steps.length`
    - Ajouter logs de debug

### Système de Séquences (Phase 2)

5. **tasks.contract.ts** (`packages/shared-frontend-backend/src/api/tasks.contract.ts`)
    - Ajouter `sequence: z.number()` au LogEntrySchema
    - Ajouter `minSequence` et `maxSequence` au PaginatedLogsResponseSchema

6. **TasksService.ts** (`packages/web-backend/src/services/TasksService.ts:578-649`)
    - Générer IDs déterministes: `${taskId}-${sequence}`
    - Calculer séquences: `globalStepIndex * 10 + subEntryIndex`
    - Retourner `minSequence` et `maxSequence` dans la réponse

7. **useTaskLogs.ts** (amélioration Phase 2)
    - Ajouter tri par séquence dans `mergeLogs()`
    - Détecter et logger les trous de séquence

### Tests (Phase 3)

8. **asyncUtils.ts** (nouveau) - Utilitaires controlledPromise
9. **useTaskLogs.deduplication.test.ts** (nouveau) - Tests frontend
10. **TasksService.log-deduplication.test.ts** (nouveau) - Tests backend
11. **TraceChunkStorage.deduplication.test.ts** (nouveau) - Tests storage

---

## Plan de Vérification

### Test Manuel

1. **Scénario 1: Tâche en cours d'exécution**
    - Créer une tâche avec un flow qui génère plusieurs steps
    - Ouvrir la page de détail de la tâche
    - Vérifier qu'aucun log n'apparaît en double
    - Rafraîchir la page → le nombre de logs ne change pas

2. **Scénario 2: Multiples onglets**
    - Ouvrir la même tâche dans 2 onglets différents
    - Lancer la tâche
    - Vérifier que les logs apparaissent une seule fois dans chaque onglet

3. **Scénario 3: Logs console**
    - Vérifier les logs browser console
    - Chercher `"No new unique logs to add (all duplicates filtered)"` → devrait être rare/absent
    - Chercher `"Sequence gap detected"` → ne devrait pas apparaître

### Tests Automatisés

```bash
# Frontend tests
npm run test:frontend -- useTaskLogs.deduplication.test.ts

# Backend tests
npm run test:backend -- TasksService.log-deduplication.test.ts
npm run test:backend -- TraceChunkStorage.deduplication.test.ts

# Tous les tests
npm run test
```

### Métriques à Surveiller

1. **Nombre de logs dupliqués filtrés** (devrait être ~0 après correction root cause #1)
2. **Trous de séquence détectés** (devrait être 0 en conditions normales)
3. **Temps de rendu des logs** (ne devrait pas augmenter avec la déduplication)

---

## Migration et Déploiement

### Étape 1: Backend (aucune breaking change)

1. Déployer TraceChunkStorage avec fix ligne 105
2. Déployer TasksService avec génération de séquences
3. Les logs existants reçoivent des séquences calculées automatiquement
4. Les nouvelles tâches utilisent les séquences dès le début

### Étape 2: Frontend

1. Déployer useTaskLogs avec déduplication
2. Déployer TaskDetailPages avec subscriptions corrigées
3. Les utilisateurs voient immédiatement la correction

### Étape 3: Vérification

1. Monitorer les logs browser pour détecter les duplications restantes
2. Vérifier que les métriques montrent 0 duplications filtrées
3. Confirmer que les tests E2E passent

---

## Résumé

**Root Causes Corrigées**:

1. ✅ Double subscription → Supprimé `appendNewLogs()` de `B2F_TASK_UPDATED`
2. ✅ Pas de déduplication → Ajouté Set-based ID tracking dans `useTaskLogs`
3. ✅ TraceChunkStorage incorrect → Fix ligne 105 pour utiliser le bon compteur

**Améliorations Ajoutées**:

1. ✅ Séquences globales → Ordre garanti même si logs arrivent en désordre
2. ✅ IDs déterministes → `${taskId}-${sequence}` = unique + reproductible
3. ✅ Tests complets → controlledPromise pour race conditions sans flakiness

**Garanties Finales**:

- Zero duplications (root causes éliminées + déduplication en filet de sécurité)
- Ordre correct toujours (tri par séquence)
- Performance maintenue (déduplication O(1), tri O(n log n))
- Tests robustes (aucune flakiness grâce à controlledPromise)
