# Plan: Centralize Workspace Metadata Storage

## Context

Workspace metadata (name, description, color, mode) is currently stored in distributed `.agent-fleet/workspace-metadata.json` files inside each workspace directory. Every other entity (projects, tasks, interventions, workers) uses centralized `data/<table>.json` storage via the `BaseRepository<T>` + `FileBasedStorage` pattern. This inconsistency makes workspace management harder, and workspaces created via API disappear from the list when no worker is connected.

**Goal:** Move workspace metadata to `data/workspaces.json` using the established repository pattern. Workspaces become first-class centralized entities, always visible (with `idle` status when no worker is connected).

**Lightweight migration** for the 2 existing workspaces (agent-fleet + image-tooling). On first access, if a workspace has no centralized record but has a legacy `.agent-fleet/workspace-metadata.json`, import its data (name, color, mode, etc.) into the centralized store. This is a one-time lazy migration — no bulk script needed.

---

## Phase 1: Entity + Repository (foundation, no behavioral change yet)

### 1.1 Define `WorkspaceMetadataEntity` type

**File:** `packages/shared-frontend-backend/src/api/workspaces.contract.ts`

Add a Zod schema for the centralized entity extending `BaseEntitySchema`:

```typescript
export const WorkspaceMetadataEntitySchema = BaseEntitySchema.extend({
	path: z.string(), // absolute filesystem path (unique key)
	name: z.string().optional(),
	description: z.string().optional(),
	color: WorkspaceColorSchema,
	mode: WorkspaceModeSchema,
});
```

Fields `id`, `version`, `createdAt`, `updatedAt` come from `BaseEntity`.

### 1.2 Add `idle` to `WorkspaceStatusSchema`

**File:** `packages/shared-frontend-backend/src/api/workspaces.contract.ts`

```typescript
export const WorkspaceStatusSchema = z.enum(['active', 'idle', 'locked', 'cleaning', 'error']);
```

### 1.3 Rewrite `WorkspaceMetadataRepository`

**File:** `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts`

Complete rewrite. Remove all FS watcher code. Follow `ProjectsRepository` pattern:

```typescript
export class WorkspaceMetadataRepository {
  constructor(private readonly base: BaseRepository<WorkspaceMetadataEntity>) {}

  async findAll(): Promise<WorkspaceMetadataEntity[]>
  async findById(id: string): Promise<WorkspaceMetadataEntity | null>
  async findByPath(path: string): Promise<WorkspaceMetadataEntity | null>
    // base.query().where('path', '=', path) → first or null
  async findByPaths(paths: string[]): Promise<Map<string, WorkspaceMetadataEntity>>
    // findAll() + filter, return Map<path, entity>
  async create(data: Omit<WorkspaceMetadataEntity, BaseEntity fields>): Promise<WorkspaceMetadataEntity>
    // validate path uniqueness, then base.create()
  async update(id: string, data: Partial<{name, description, color, mode}>): Promise<WorkspaceMetadataEntity>
  async delete(id: string): Promise<void>
  async upsertByPath(path, data): Promise<WorkspaceMetadataEntity>
    // find by path → update if exists, create if not
  async ensureByPath(path: string): Promise<WorkspaceMetadataEntity>
    // find by path → return if exists, create with defaults if not
```

### 1.4 Write `WorkspaceMetadataRepository.test.ts`

**File:** `packages/web-backend/src/repositories/WorkspaceMetadataRepository.test.ts`

Test all methods using `InMemoryStorage`. Key tests: findByPath, upsertByPath, ensureByPath, path uniqueness constraint.

---

## Phase 2: Service Layer

### 2.1 Update `WorkspaceMapper`

**File:** `packages/web-backend/src/services/WorkspaceMapper.ts`

Add new mapping method:

```typescript
static mapEntityToApi(
  entity: WorkspaceMetadataEntity,
  workerInfo?: { workerId: string; connectedAt: string; gitBranch?: string },
  projectId?: string
): ApiWorkspace
```

- `status` = workerInfo ? `'active'` : `'idle'`
- `activeWorkerId` = `workerInfo?.workerId`
- `gitBranch` = `workerInfo?.gitBranch`
- Keep `extractWorkspaceName()` (private → used by new method too)
- Keep `generateIdFromPath()` for potential backward compat but it's no longer the primary ID source

Old methods (`mapWorkerWorkspaceToApi`, `mapWorkerWorkspacesToApi`, `mapPathToWorkspace`) → remove after full migration.

### 2.2 Refactor `WorkspacesService`

**File:** `packages/web-backend/src/services/WorkspacesService.ts`

**Constructor:**

- Remove `setChangeCallback` (no more watchers)
- `metadataRepository` type is now the new centralized repo

**`getWorkspacesData()` / `getWorkspacesList()`:**

1. Fetch ALL workspaces from `metadataRepository.findAll()`
2. Fetch connected workers from orchestrator (for enrichment only)
3. Build `workerByPath: Map<string, WorkerInfo>` from orchestrator data
4. Auto-register unknown worker paths: for each worker path not in centralized store →
    - Try reading legacy `.agent-fleet/workspace-metadata.json` via `WorkspaceMetadataFile.read(path)` (preserves existing name/color/mode)
    - If legacy file exists → `metadataRepository.create(legacyData)`
    - If no legacy file → `metadataRepository.ensureByPath(path)` (creates with defaults)
    - This handles migration of the 2 existing workspaces transparently
5. Map each entity → `WorkspaceMapper.mapEntityToApi(entity, workerByPath.get(entity.path), projectId)`
6. All workspaces visible — those without workers get `status: 'idle'`

**`createWorkspace()`:**

1. Delegate directory + git to `WorkspaceCreationService` (returns `{ path, gitBranch }`)
2. Persist metadata via `metadataRepository.create({ path, name, description, color, mode })`
3. Map to API DTO and broadcast event

**`updateWorkspace()`:**

1. Direct `metadataRepository.findById(id)` — no need to resolve path through orchestrator
2. `metadataRepository.update(id, data)`
3. Enrich with worker info for response, broadcast event

**`resolveWorkspacePath()`:**

1. `metadataRepository.findById(id)` → return `entity.path`

**Remove:** `deduplicateWorkspaces()` (enrichment handles this), all `startWatching()` calls.

### 2.3 Refactor `WorkspaceCreationService`

**File:** `packages/web-backend/src/services/WorkspaceCreationService.ts`

- Remove `WorkspaceMetadataFile` dependency
- Remove Step 5 (metadata write) and Step 6 (mapper call)
- Return `{ path: string; gitBranch?: string }` instead of `Workspace`
- Metadata persistence responsibility moves to `WorkspacesService.createWorkspace()`

### 2.4 Update `DataStoreFactory` wiring

**File:** `packages/web-backend/src/factories/DataStoreFactory.ts`

```typescript
getWorkspacesService(): WorkspacesService {
  const baseRepo = new BaseRepository<WorkspaceMetadataEntity>('workspaces', this.storage);
  const metadataRepo = new WorkspaceMetadataRepository(baseRepo);
  // ... rest unchanged
}
```

Remove `WorkspaceMetadataFile` import. Also clean up `getProjectsService()` if it creates a dead `WorkspaceMetadataFile`.

---

## Phase 3: Cleanup

### 3.1 Remove/deprecate old files

- `WorkspaceMetadataFile.ts` → keep `read()` only (used for lazy migration of legacy files), remove `write()`/`ensureFile()`. Mark as deprecated.
- `WorkspaceMetadataFile.test.ts` → trim to cover only `read()`
- Old `WorkspaceMetadata` interface from the old repository → replaced by entity type

### 3.2 Clean up dead code in `ProjectsService`

- Remove `WorkspaceMetadataRepository` injection if it's dead (never called)

### 3.3 Update tests

| Test file                             | Action                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| `WorkspaceMetadataRepository.test.ts` | New file (Phase 1.4)                                         |
| `WorkspacesService.test.ts`           | Update mocks for new repo API, add tests for idle workspaces |
| `WorkspaceCreationService.test.ts`    | Remove metadata file mocks, test returns `{path, gitBranch}` |
| `WorkspaceMapper.test.ts`             | Add tests for `mapEntityToApi` if file exists                |

---

## Files Modified (summary)

| File                                                               | Action                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| `shared-frontend-backend/src/api/workspaces.contract.ts`           | Add `WorkspaceMetadataEntitySchema`, add `idle` status |
| `web-backend/src/repositories/WorkspaceMetadataRepository.ts`      | **Rewrite** — BaseRepository-based                     |
| `web-backend/src/repositories/WorkspaceMetadataRepository.test.ts` | **New**                                                |
| `web-backend/src/services/WorkspacesService.ts`                    | Refactor to use centralized repo                       |
| `web-backend/src/services/WorkspacesService.test.ts`               | Update mocks + new tests                               |
| `web-backend/src/services/WorkspaceCreationService.ts`             | Remove metadata write, return simpler result           |
| `web-backend/src/services/WorkspaceCreationService.test.ts`        | Update accordingly                                     |
| `web-backend/src/services/WorkspaceMapper.ts`                      | Add `mapEntityToApi`, remove old methods               |
| `web-backend/src/factories/DataStoreFactory.ts`                    | Rewire to BaseRepository                               |
| `web-backend/src/services/WorkspaceMetadataFile.ts`                | Keep `read()` only, deprecate rest                     |
| `web-backend/src/services/WorkspaceMetadataFile.test.ts`           | Trim to `read()` tests only                            |

---

## Verification

1. `npm run check` — TypeScript + ESLint pass
2. `npm run test:agent` — all backend tests pass
3. Manual: create a workspace via UI → appears in list with `active` status (if worker connected) or `idle` (if not)
4. Manual: update workspace name/color → persists after refresh
5. Verify `data/workspaces.json` is created with correct structure
6. Verify `.agent-fleet/workspace-metadata.json` is no longer written anywhere
