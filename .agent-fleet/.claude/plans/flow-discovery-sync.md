# Flow Discovery & Synchronization Implementation Plan

**Date**: 2025-12-13
**Status**: In Progress

## Objective

Implement worker-driven flow discovery where each worker announces its available flows to the orchestrator, enabling multi-project support, version management, and task assignment based on flow availability.

## Key Principles

1. **Workers own flows**: Each worker loads and announces its flows
2. **Orchestrator = passive registry**: Maintains `worker → project → flows` mapping
3. **Project isolation**: One worker = one project (from package.json or git remote)
4. **Version awareness**: Flows have explicit versions + computed hash for validation
5. **Pull-based assignment**: Workers request tasks when idle
6. **Hash validation**: Same version must have identical hash across workers

## Architecture Changes

### Current State
- Orchestrator loads flows from `.agent-fleet/flows.yml`
- Workers load flows from `.agent-fleet/flows.yml`
- No synchronization between orchestrator and workers
- No project isolation
- No version management

### Target State
- Workers load flows and announce to orchestrator
- Orchestrator maintains FlowDiscoveryRegistry (passive)
- Each worker belongs to one project
- Flows have version + hash
- Task assignment via pull model (REQUEST_TASK)
- Hash validation ensures version consistency

---

## Implementation Phases

### Phase 1: Add version + hash to flows (worker-side)

**Files to modify:**
- `src/flow/types.ts` - Add `version` field to FlowDefinition
- `src/flow/registry/FlowRegistry.ts` - Validate version, compute hash
- `src/workers/flow/FlowWorker.ts` - Build flow metadata with hash

**New interfaces:**
```typescript
// src/flow/types.ts
export interface FlowDefinition {
  id: string;
  version: string;  // NEW - Semver format
  name: string;
  // ... rest unchanged
}

export interface FlowMetadata {
  id: string;
  version: string;
  hash: string;  // 8-char SHA256 hash
  name: string;
  description: string;
  inputs: Record<string, VariableType>;
  workspace: WorkspaceConfig;
  statusTransitions?: {
    onSuccess?: TaskStatus;
    onFailure?: TaskStatus;
  };
}
```

**Tasks:**
1. Add `version` field validation in FlowRegistry
2. Implement `computeFlowHash(flow)` method
3. Implement `buildFlowMetadata()` to create FlowMetadata[]
4. Update flow YAML parsing to require version
5. Write unit tests for hash computation and version validation

**Tests:**
- Test 5.1-5.5: Hash computation
- Test 8.1-8.4: Version validation

---

### Phase 2: Create FlowDiscoveryRegistry in orchestrator ✅ COMPLETE

**New files:**
- `src/orchestrator/registry/FlowDiscoveryRegistry.ts` ✅
- `src/orchestrator/registry/FlowDiscoveryRegistry.test.ts` ✅

**Classes:**
```typescript
export class FlowDiscoveryRegistry {
  private workers: Map<string, WorkerFlowRegistry>;
  private flowVersionIndex: Map<string, FlowVersionEntry>;
  private projectFlowIndex: Map<string, Map<string, FlowVersionEntry[]>>;

  registerWorker(workerId, projectId, workspacePath, flows): void ✅
  unregisterWorker(workerId): void ✅
  updateWorkerFlows(workerId, flows): void ✅
  findWorkersWithFlow(projectId, flowId, version?): WorkerFlowEntry[] ✅
  getLatestVersion(projectId, flowId): string ✅
  getAllProjects(): string[] ✅
  getProjectFlows(projectId): Map<string, WorkerFlowEntry[]> ✅
  getWorkerFlows(workerId): FlowMetadata[] ✅
  hasWorker(workerId): boolean ✅
}

export class FlowVersionMismatchError extends Error {
  constructor(projectId, flowId, version, existingHash, newHash, existingWorkerId, newWorkerId) ✅
}
```

**Tasks:**
1. ✅ Create FlowDiscoveryRegistry class with all methods
2. ✅ Implement hash validation on registration
3. ✅ Implement version resolution logic (built-in semver comparison)
4. ✅ Write comprehensive unit tests (40+ tests)

**Tests:**
- ✅ Test 1.1-1.5: Worker registration (including version mismatch detection)
- ✅ Test 2.1-2.5: Query operations (findWorkersWithFlow, getLatestVersion, etc.)
- ✅ Test 3.1-3.6: Update and unregister operations (add/remove/update flows)

---

### Phase 3: Modify handshake protocol

**Files to modify:**
- `src/shared/types.ts` - Add new message types and fields
- `src/shared/protocol.ts` - Update message serialization if needed
- `src/workers/flow/FlowWorker.ts` - Update WORKER_READY
- `src/orchestrator/websocket/WorkerWebSocketServer.ts` - Handle new messages

**New message types:**
```typescript
export enum MessageType {
  WORKER_READY = 'WORKER_READY',      // Updated
  FLOWS_UPDATED = 'FLOWS_UPDATED',    // NEW
  REQUEST_TASK = 'REQUEST_TASK',      // NEW
  // ... existing
}

export interface WorkerReadyMessage extends Message {
  type: MessageType.WORKER_READY;
  workerType: WorkerType;
  preferredId?: string;
  projectId: string;              // NEW
  workspacePath: string;          // NEW
  availableFlows: FlowMetadata[]; // NEW
}

export interface FlowsUpdatedMessage extends Message {
  type: MessageType.FLOWS_UPDATED;
  workerId: string;
  projectId: string;
  flows: FlowMetadata[];
  changes?: {
    added: string[];
    removed: string[];
    updated: string[];
  };
}

export interface RequestTaskMessage extends Message {
  type: MessageType.REQUEST_TASK;
  workerId: string;
}
```

**Tasks:**
1. Add `projectId`, `workspacePath`, `availableFlows` to WorkerReadyMessage
2. Implement `detectProjectId()` in FlowWorker
3. Update `sendWorkerReady()` to include flow metadata
4. Update orchestrator to handle enhanced WORKER_READY
5. Integrate FlowDiscoveryRegistry.registerWorker() in handshake

**Tests:**
- Test 4.1-4.5: Project ID detection
- Test 6.1-6.3: Build flow metadata
- Test 7.1-7.2: WORKER_READY message
- Test 9.1-9.3: Handle WORKER_READY

---

### Phase 4: Implement task queue system

**Files to modify:**
- `src/orchestrator/core/TaskManager.ts` - Add queue management
- `src/shared/types.ts` - Update Task type

**New data structures:**
```typescript
// In TaskManager
private globalBacklog: Task[] = [];
private workerQueues: Map<string, Task[]> = new Map();
private idleWorkers: WorkerIdleEntry[] = [];  // FIFO queue

interface WorkerIdleEntry {
  workerId: string;
  requestedAt: Date;
}
```

**Tasks:**
1. Add global backlog and worker-specific queues
2. Implement `addTaskToBacklog(task)` and `addTaskToWorkerQueue(workerId, task)`
3. Implement `markWorkerIdle(workerId)` and `markWorkerBusy(workerId)`
4. Implement `findMatchingTask(workerId)` - check worker queue first, then backlog
5. Update `createTask()` to route to appropriate queue
6. Add validation for pre-assigned tasks

**Tests:**
- Test 14.1-14.8: Queue management

---

### Phase 5: Add version resolution and REQUEST_TASK

**Files to modify:**
- `src/orchestrator/registry/FlowDiscoveryRegistry.ts` - Add version resolution
- `src/orchestrator/core/TaskManager.ts` - Implement task assignment logic
- `src/orchestrator/websocket/WorkerWebSocketServer.ts` - Handle REQUEST_TASK
- `src/workers/flow/FlowWorker.ts` - Send REQUEST_TASK on idle

**New utilities:**
```typescript
// In FlowDiscoveryRegistry or utility file
function parseFlowReference(flowId: string): { id: string; version?: string }
function compareVersions(v1: string, v2: string): number
function findLatestVersion(versions: string[]): string
```

**Tasks:**
1. Implement `parseFlowReference()` to support `flowId@version` syntax
2. Implement semver comparison using existing library or custom logic
3. Implement `resolveFlowReference()` in FlowDiscoveryRegistry
4. Update task assignment to use version resolution
5. Implement REQUEST_TASK message handling
6. Add automatic REQUEST_TASK on worker start and task completion

**Tests:**
- Test 10.1-10.8: Task assignment with discovery
- Test 13.1-13.7: Version resolution
- Test 15.1-15.3: REQUEST_TASK protocol

---

### Phase 6: Remove FlowRegistry from orchestrator

**Files to modify:**
- `src/orchestrator/core/index.ts` - Remove FlowRegistry
- `src/orchestrator/core/RestAPI.ts` - Remove FlowRegistry dependency
- Update any tests that depend on orchestrator having FlowRegistry

**Tasks:**
1. Remove `flowRegistry` field from Orchestrator
2. Remove `loadFlows()` method
3. Remove `flowRegistry?.startWatching()` call
4. Update RestAPI to use FlowDiscoveryRegistry instead
5. Update or remove DEFAULT_FLOWS usage
6. Clean up imports

**Tests:**
- Verify existing tests still pass after removal
- Add tests that verify orchestrator doesn't load flows directly

---

### Phase 7: Update hot-reload (FLOWS_UPDATED)

**Files to modify:**
- `src/workers/flow/FlowWorker.ts` - Send FLOWS_UPDATED on reload
- `src/flow/registry/FlowRegistry.ts` - Detect changes
- `src/orchestrator/websocket/WorkerWebSocketServer.ts` - Handle FLOWS_UPDATED

**Tasks:**
1. Modify FlowRegistry.reloadFlows() to track changes (added/removed/updated)
2. Send FLOWS_UPDATED message after reload in FlowWorker
3. Handle FLOWS_UPDATED in orchestrator
4. Call FlowDiscoveryRegistry.updateWorkerFlows()
5. Handle version mismatch errors during update

**Tests:**
- Test 11.1-11.5: Hot-reload scenarios

---

### Phase 8: Write all tests

**Test files to create/update:**
- `src/orchestrator/registry/FlowDiscoveryRegistry.test.ts` - NEW
- `src/workers/flow/FlowWorker.test.ts` - UPDATE
- `src/flow/registry/FlowRegistry.test.ts` - UPDATE
- `src/orchestrator/core/TaskManager.test.ts` - UPDATE
- `src/orchestrator/websocket/WorkerWebSocketServer.test.ts` - UPDATE
- Integration test (e.g., `src/integration/flow-discovery.test.ts`) - NEW

**Test breakdown:**
- Unit tests: ~70 tests covering all components
- Integration tests: ~3 tests covering cross-component interactions
- E2E test: 1 test covering complete flow

**Tasks:**
1. Write FlowDiscoveryRegistry unit tests (Tests 1.x, 2.x, 3.x)
2. Write version resolution tests (Tests 13.x)
3. Write project ID detection tests (Tests 4.x)
4. Write hash computation tests (Tests 5.x)
5. Write queue management tests (Tests 14.x)
6. Write task assignment tests (Tests 10.x)
7. Write protocol tests (Tests 15.x)
8. Write hot-reload tests (Tests 11.x)
9. Write E2E test (Test 16)
10. Run all tests and fix failures

---

### Phase 9: Final validation

**Tasks:**
1. Run full test suite: `npm test`
2. Check test coverage: `npm run test:coverage` (ensure >70%)
3. Run build: `npm run build`
4. Manual smoke test: Start orchestrator + worker, create task, verify assignment
5. Update documentation if needed

---

## Acceptance Criteria

✅ All 73 test scenarios pass
✅ Test coverage >70% for new code
✅ Build succeeds without errors
✅ Workers announce flows with version + hash
✅ Orchestrator maintains FlowDiscoveryRegistry
✅ Task assignment uses pull model (REQUEST_TASK)
✅ Version resolution works (latest + specific versions)
✅ Hash validation rejects conflicting versions
✅ Project isolation enforced
✅ Hot-reload updates registry
✅ E2E test demonstrates complete flow

---

## Risk Areas

1. **Semver parsing**: Use existing library (e.g., `semver` npm package) or implement carefully
2. **Concurrent registrations**: Ensure thread-safety in FlowDiscoveryRegistry
3. **Hash consistency**: Ensure hash computation is deterministic
4. **Backward compatibility**: Existing flows need `version` field added
5. **WebSocket message ordering**: Ensure messages processed in correct order

---

## Dependencies

- `semver` npm package (for version comparison)
- `crypto` module (for hash computation)

---

## Rollback Plan

If critical issues arise:
1. Revert changes to orchestrator
2. Workers can still load flows locally
3. Fall back to direct assignment without discovery

---

## Next Steps

1. Start Phase 1: Add version + hash
2. Progress through phases sequentially
3. Run tests after each phase
4. Report back when all phases complete
