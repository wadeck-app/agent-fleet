# Implementation Plan: Centralized Workspace Storage in Backend Database

## Problem Statement

**Current Architecture Issues:**

- Workspaces are only visible when a worker is connected to them
- `getWorkspacesList()` queries in-memory orchestrator data (`getConnectedWorkersWorkspaces()`)
- Newly created workspaces don't appear in UI until a worker connects
- Workspace metadata stored in scattered `.agent-fleet/workspace-metadata.json` files
- No centralized source of truth for workspace inventory
- Server restart loses all workspace tracking (must wait for workers to reconnect)

**User Request:**

> "Stocker les workspaces dans le backend, c'est surement mieux à mon avis sur le long terme. Un worker qui se connecte de son plein gré, il vient enregistrer son workspace, et on stock plus les infos dans les workspaces, c'est trop galère niveau centralisation"

## Solution Overview

Migrate from file-based, worker-dependent workspace tracking to **database-backed workspace registry** where:

1. Workspaces are persisted in backend database (`/data/workspaces.json`)
2. Workers auto-register their workspace on connection (upsert pattern)
3. All workspaces visible in UI regardless of worker connection status
4. Worker connection only updates `status` and `activeWorkerId` fields
5. Workspace metadata migrated from local files to database

---

## Architecture Changes

### Before (Current):

```
Worker connects → In-memory Map → Backend queries orchestrator → UI displays
Worker disconnects → Data lost → UI shows nothing
```

### After (Proposed):

```
Worker connects → Upsert workspace in DB → Set status=active → UI displays
Worker disconnects → Update status=inactive → UI still displays (as inactive)
Backend queries DB directly → Always shows all workspaces
```

---

## Implementation Phases

### Phase 1: Database Model & Schema

#### 1.1 Define Workspace Schema

**File:** `packages/shared-frontend-backend/src/api/workspaces.contract.ts`

Extend existing `WorkspaceSchema` to include persistence fields:

```typescript
export const WorkspaceSchema = z.object({
	// Identity
	id: z.string(), // UUID (generated once, stable)
	path: z.string(), // Absolute workspace path (unique)

	// Metadata (user-editable)
	name: z.string().optional(),
	description: z.string().optional(),
	color: WorkspaceColorSchema.optional(),
	mode: WorkspaceModeSchema, // development | production | staging

	// Git information
	gitBranch: z.string().optional(),
	gitRepositoryUrl: z.string().url().optional(),

	// Relationships
	projectId: z.string().optional(), // Linked project (if any)

	// Worker connection status
	status: WorkspaceStatusSchema, // active | inactive | error
	activeWorkerId: z.string().optional(), // Current worker ID (null if inactive)

	// Timestamps
	createdAt: z.string(),
	updatedAt: z.string(),
	lastConnectedAt: z.string().optional(), // Last worker connection timestamp

	// Optimistic locking
	version: z.number(),

	// Derived/computed (not stored)
	tasksCount: z.number().optional(), // Computed from tasks table
});

export const WorkspaceStatusSchema = z.enum(['active', 'inactive', 'error', 'archived']);
```

**Key Design Decisions:**

- `path` is the natural unique key (enforced at DB level)
- `id` is UUID for stable references (Tasks, WorkspaceScripts reference this)
- `status` tracks worker connection state
- `activeWorkerId` tracks which worker (if any) is running in this workspace
- `lastConnectedAt` tracks last activity for sorting/cleanup

#### 1.2 Create Repository

**File:** `packages/web-backend/src/repositories/WorkspacesRepository.ts` (NEW)

```typescript
export class WorkspacesRepository {
	constructor(private baseRepo: BaseRepository<Workspace>) {}

	// Core CRUD
	findAll(): Workspace[];
	findById(id: string): Workspace | null;
	findByPath(path: string): Workspace | null; // Key lookup method
	create(data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Workspace;
	update(id: string, data: Partial<Workspace>): Workspace;
	delete(id: string): void;

	// Status management
	findActive(): Workspace[]; // status === 'active'
	findInactive(): Workspace[]; // status === 'inactive'
	findByStatus(status: WorkspaceStatus): Workspace[];

	// Worker connection tracking
	markActive(id: string, workerId: string): Workspace;
	markInactive(id: string): Workspace;
	updateLastConnected(id: string): Workspace;

	// Project relationships
	findByProject(projectId: string): Workspace[];
	updateProject(id: string, projectId: string | null): Workspace;

	// Upsert for worker registration
	upsertByPath(data: Partial<Workspace> & { path: string }): Workspace;
}
```

**Upsert Logic** (key method for worker registration):

```typescript
upsertByPath(data: Partial<Workspace> & { path: string }): Workspace {
  const existing = this.findByPath(data.path);

  if (existing) {
    // Update existing: merge new data, update timestamps
    return this.update(existing.id, {
      ...data,
      lastConnectedAt: new Date().toISOString(),
    });
  } else {
    // Create new: generate ID, set defaults
    return this.create({
      id: generateUUID(),
      path: data.path,
      name: data.name || getBasename(data.path),
      mode: data.mode || 'development',
      status: 'active',
      activeWorkerId: data.activeWorkerId,
      gitBranch: data.gitBranch,
      projectId: data.projectId,
      lastConnectedAt: new Date().toISOString(),
    });
  }
}
```

---

### Phase 2: Worker Registration on Connection

#### 2.1 Intercept Worker Connection Event

**File:** `packages/web-backend/src/orchestrator/OrchestratorEventBridge.ts`

Modify `StateEvent.WORKER_CONNECTED` handler to persist workspace:

```typescript
// Current (lines 66-85)
this.stateManager.on(StateEvent.WORKER_CONNECTED, (data) => {
  const worker = this.orchestrator.getWorker(data.workerId);
  if (!worker) return;

  this.eventBroadcaster.broadcast(B2F_WORKER_CONNECTED, { ... });
  this.eventBroadcaster.broadcast(B2F_WORKERS_UPDATED, {});
  this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {});
});

// New (add workspace persistence)
this.stateManager.on(StateEvent.WORKER_CONNECTED, async (data) => {
  const worker = this.orchestrator.getWorker(data.workerId);
  if (!worker) return;

  // NEW: Register workspace in database
  try {
    await this.workspacesService.registerWorkerWorkspace({
      workerId: data.workerId,
      workspacePath: worker.workspacePath,
      projectId: worker.projectId,
      gitBranch: worker.gitBranch,
    });
  } catch (error) {
    log.error('Failed to register workspace on worker connection:', error);
  }

  // Existing event broadcasts
  this.eventBroadcaster.broadcast(B2F_WORKER_CONNECTED, { ... });
  this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {});
});
```

**Required Changes:**

- Make event handler `async`
- Inject `WorkspacesService` into `OrchestratorEventBridge` constructor
- Add error handling (non-blocking - worker can still connect if DB write fails)

#### 2.2 Add WorkspacesService Method

**File:** `packages/web-backend/src/services/WorkspacesService.ts`

```typescript
async registerWorkerWorkspace(data: {
  workerId: string;
  workspacePath: string;
  projectId: string;
  gitBranch?: string;
}): Promise<Workspace> {
  log.info('Registering worker workspace', { workerId: data.workerId, path: data.workspacePath });

  // Check if metadata file exists
  const metadata = await this.metadataRepository.getMetadataByPath(data.workspacePath);

  // Upsert workspace in database
  const workspace = this.repository.upsertByPath({
    path: data.workspacePath,
    name: metadata?.name,
    description: metadata?.description,
    color: metadata?.color,
    mode: metadata?.mode || 'development',
    status: 'active',
    activeWorkerId: data.workerId,
    projectId: data.projectId,
    gitBranch: data.gitBranch,
  });

  // Start watching metadata file
  this.metadataRepository.startWatching(data.workspacePath);

  log.info('Workspace registered successfully', { id: workspace.id });
  return workspace;
}
```

**Logic:**

1. Read metadata file (if exists) to get user customizations
2. Upsert workspace in DB (create or update)
3. Set `status='active'` and link `activeWorkerId`
4. Watch metadata file for future changes

---

### Phase 3: Worker Disconnection Handling

#### 3.1 Handle Worker Disconnection

**File:** `packages/web-backend/src/orchestrator/OrchestratorEventBridge.ts`

Modify `StateEvent.WORKER_DISCONNECTED` handler:

```typescript
this.stateManager.on(StateEvent.WORKER_DISCONNECTED, async data => {
	// NEW: Mark workspace as inactive
	try {
		await this.workspacesService.unregisterWorkerWorkspace(data.workerId);
	} catch (error) {
		log.error('Failed to unregister workspace on worker disconnect:', error);
	}

	// Existing event broadcasts
	this.eventBroadcaster.broadcast(B2F_WORKER_DISCONNECTED, { workerId: data.workerId });
	this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {});
});
```

#### 3.2 Add Service Method

**File:** `packages/web-backend/src/services/WorkspacesService.ts`

```typescript
async unregisterWorkerWorkspace(workerId: string): Promise<void> {
  log.info('Unregistering worker workspace', { workerId });

  // Find workspace by activeWorkerId
  const workspaces = this.repository.query()
    .where('activeWorkerId', '=', workerId)
    .execute();

  if (workspaces.length === 0) {
    log.warn('No workspace found for worker', { workerId });
    return;
  }

  // Mark as inactive
  for (const workspace of workspaces) {
    this.repository.update(workspace.id, {
      status: 'inactive',
      activeWorkerId: undefined,
    });
    log.info('Workspace marked inactive', { id: workspace.id, path: workspace.path });
  }
}
```

---

### Phase 4: Refactor WorkspacesService to Use Database

#### 4.1 Modify getWorkspacesList

**File:** `packages/web-backend/src/services/WorkspacesService.ts`

Current implementation queries orchestrator (lines 210-269). Replace with DB query:

```typescript
async getWorkspacesList(query: WorkspacesListQuery): Promise<WorkspacesListResponse> {
  log.info('Fetching workspaces list from database...');

  try {
    // Fetch ALL workspaces from database
    let workspaces = this.repository.findAll();

    // Apply domain filters (status, mode)
    if (query.status) {
      workspaces = workspaces.filter(w => w.status === query.status);
    }
    if (query.mode) {
      workspaces = workspaces.filter(w => w.mode === query.mode);
    }

    // Apply search if provided
    if (query.search) {
      workspaces = this.applySearch(workspaces, query.search);
    }

    // Enrich with task counts
    workspaces = await this.enrichWithTaskCounts(workspaces);

    // Apply sorting
    if (query.sortBy && query.sortOrder) {
      workspaces = this.applySorting(workspaces, query.sortBy, query.sortOrder);
    }

    // Apply pagination
    const page = query.page || 1;
    const pageSize = query.pageSize || 10;
    const total = workspaces.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedWorkspaces = workspaces.slice(start, start + pageSize);

    return {
      items: paginatedWorkspaces,
      pagination: { total, page, pageSize, totalPages },
    };
  } catch (error) {
    log.error('Failed to fetch workspaces list:', error);
    throw error;
  }
}

private async enrichWithTaskCounts(workspaces: Workspace[]): Promise<Workspace[]> {
  const tasksRepo = this.dataStoreFactory.getTasksRepository();

  return workspaces.map(workspace => ({
    ...workspace,
    tasksCount: tasksRepo.query()
      .where('workspaceId', '=', workspace.id)
      .execute().length,
  }));
}
```

**Key Changes:**

- Remove dependency on `orchestratorWrapper.getConnectedWorkersWorkspaces()`
- Remove deduplication logic (DB ensures uniqueness by path)
- Remove metadata file reading (data now in DB)
- Remove `buildEnrichmentData()` (activeWorkerId already in DB)
- Simplify to pure DB query + filtering + pagination

#### 4.2 Remove Obsolete Methods

Delete these methods from `WorkspacesService`:

- `deduplicateWorkspaces()` - No longer needed
- `buildEnrichmentData()` - Data now in DB
- Metadata file watching logic - Handled during worker registration

---

### Phase 5: Migration from File-Based to Database

#### 5.1 Create Migration

**File:** `packages/web-backend/src/migrations/MigrateWorkspacesToDatabase.ts` (NEW)

```typescript
export class MigrateWorkspacesToDatabase {
	constructor(
		private workspacesRepo: WorkspacesRepository,
		private metadataRepo: WorkspaceMetadataRepository,
		private projectsRepo: ProjectsRepository
	) {}

	async migrate(options: { dryRun?: boolean } = {}): Promise<MigrationResult> {
		log.info('Starting workspace migration to database...');

		const discovered: WorkspaceDiscovery[] = [];

		// Strategy 1: Scan all projects' workspace paths
		const projects = this.projectsRepo.findAll();
		for (const project of projects) {
			if (project.workspaceIds && project.workspaceIds.length > 0) {
				for (const workspaceId of project.workspaceIds) {
					// workspaceId might be a path or hash - need to resolve
					const workspace = await this.discoverWorkspaceById(workspaceId, project.id);
					if (workspace) discovered.push(workspace);
				}
			}
		}

		// Strategy 2: Scan filesystem for .agent-fleet directories
		const scannedWorkspaces = await this.scanFilesystem();
		discovered.push(...scannedWorkspaces);

		// Deduplicate by path
		const uniqueWorkspaces = this.deduplicateByPath(discovered);

		log.info(`Discovered ${uniqueWorkspaces.length} unique workspaces`);

		if (options.dryRun) {
			return { workspaces: uniqueWorkspaces, migrated: 0 };
		}

		// Import into database
		let migrated = 0;
		for (const workspace of uniqueWorkspaces) {
			try {
				this.workspacesRepo.upsertByPath({
					path: workspace.path,
					name: workspace.name,
					description: workspace.description,
					color: workspace.color,
					mode: workspace.mode,
					projectId: workspace.projectId,
					status: 'inactive', // No worker connected yet
					gitRepositoryUrl: workspace.gitRepositoryUrl,
				});
				migrated++;
			} catch (error) {
				log.error(`Failed to migrate workspace: ${workspace.path}`, error);
			}
		}

		log.info(`Migration complete: ${migrated}/${uniqueWorkspaces.length} workspaces migrated`);
		return { workspaces: uniqueWorkspaces, migrated };
	}

	private async scanFilesystem(): Promise<WorkspaceDiscovery[]> {
		// Scan common locations: /home/*, /workspace/*, C:\Users\*\workspace
		// Look for .agent-fleet/workspace-metadata.json files
		// Read metadata and construct workspace objects
		// Return discovered workspaces
	}
}
```

**Migration Strategy:**

1. **Dry run first**: Preview what will be migrated
2. **Source 1**: Read project.workspaceIds[] and resolve paths
3. **Source 2**: Filesystem scan for `.agent-fleet/workspace-metadata.json`
4. **Deduplicate** by path
5. **Import** into database with `status='inactive'`
6. **Validation**: Report any errors

#### 5.2 Run Migration

Add migration script:

**File:** `packages/web-backend/src/scripts/migrate-workspaces.ts`

```typescript
import { DataStoreFactory } from '../factories/DataStoreFactory';

async function main() {
	const factory = DataStoreFactory.initialize('file');
	const migration = new MigrateWorkspacesToDatabase(
		factory.getWorkspacesRepository(),
		factory.getWorkspaceMetadataRepository(),
		factory.getProjectsRepository()
	);

	// Dry run first
	console.log('=== DRY RUN ===');
	const dryResult = await migration.migrate({ dryRun: true });
	console.log(`Would migrate ${dryResult.workspaces.length} workspaces`);
	dryResult.workspaces.forEach(w => console.log(`  - ${w.path}`));

	// Confirm
	const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
	const answer = await new Promise<string>(resolve => {
		readline.question('\nProceed with migration? (yes/no): ', resolve);
	});
	readline.close();

	if (answer.toLowerCase() === 'yes') {
		console.log('\n=== MIGRATING ===');
		const result = await migration.migrate();
		console.log(`✓ Migrated ${result.migrated}/${result.workspaces.length} workspaces`);
	} else {
		console.log('Migration cancelled');
	}
}

main().catch(console.error);
```

---

### Phase 6: Update Workspace Creation Flow

#### 6.1 Modify createWorkspace

**File:** `packages/web-backend/src/services/WorkspacesService.ts`

Current implementation (lines 401-421) creates directory + metadata file. Update to also persist in DB:

```typescript
async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
  log.info('Creating workspace', { path: data.path });

  try {
    // 1. Create workspace directory and metadata file (existing logic)
    const tempWorkspace = await this.creationService.createWorkspace(data);

    // 2. Persist in database (NEW)
    const workspace = this.repository.create({
      id: tempWorkspace.id,  // Use ID from metadata file
      path: data.path,
      name: data.name,
      description: data.description,
      color: data.color,
      mode: data.mode || 'development',
      status: 'inactive',    // No worker yet
      activeWorkerId: undefined,
      projectId: undefined,   // Not linked to project yet
      gitBranch: tempWorkspace.gitBranch,
      gitRepositoryUrl: data.gitOptions?.repositoryUrl,
    });

    // 3. Start watching metadata file
    this.metadataRepository.startWatching(data.path);

    // 4. Emit event
    this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {} as any);

    log.info('Successfully created workspace', { id: workspace.id });
    return workspace;
  } catch (error) {
    log.error('Failed to create workspace:', error);
    throw error;
  }
}
```

**Key Change:** Workspace is now persisted in DB immediately after creation, so it appears in the list even without a worker.

---

### Phase 7: Maintain Metadata File Sync

Even with DB storage, maintain `.agent-fleet/workspace-metadata.json` files for:

- Backward compatibility
- Worker-side reading (workers read metadata locally)
- User-editable fields (name, description, color)

**Strategy: Two-way sync**

1. **DB → File**: When workspace updated via API, write to file
2. **File → DB**: File watcher detects changes, updates DB

#### 7.1 File Watcher Updates DB

**File:** `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts`

Modify file watcher callback to update database:

```typescript
startWatching(workspacePath: string): void {
  // ... existing watcher setup ...

  const watcher = fs.watch(metadataPath, async (eventType) => {
    if (eventType === 'change') {
      log.info(`Metadata file changed: ${workspacePath}`);

      // Read updated metadata
      const metadata = await this.metadataFile.read(workspacePath);

      // Update database
      const workspace = this.workspacesRepo.findByPath(workspacePath);
      if (workspace && metadata) {
        this.workspacesRepo.update(workspace.id, {
          name: metadata.name,
          description: metadata.description,
          color: metadata.color,
          mode: metadata.mode,
        });
      }

      // Emit event
      if (this.changeCallback) {
        this.changeCallback(workspacePath);
      }
    }
  });

  this.watchers.set(workspacePath, watcher);
}
```

#### 7.2 DB Updates Write to File

**File:** `packages/web-backend/src/services/WorkspacesService.ts`

When `updateWorkspace()` is called:

```typescript
async updateWorkspace(workspaceId: string, data: UpdateWorkspaceDto): Promise<Workspace> {
  log.info(`Updating workspace ${workspaceId}`, { data });

  // 1. Get workspace from DB
  const workspace = this.repository.findById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  // 2. Update database
  const updated = this.repository.update(workspaceId, data);

  // 3. Update metadata file (sync)
  await this.metadataRepository.upsertMetadata(workspace.path, {
    name: data.name,
    description: data.description,
    color: data.color,
  });

  // 4. Emit event
  this.eventBroadcaster.broadcast(B2F_WORKSPACE_UPDATED, updated);

  return updated;
}
```

---

### Phase 8: Update DataStoreFactory

#### 8.1 Add WorkspacesRepository

**File:** `packages/web-backend/src/factories/DataStoreFactory.ts`

```typescript
export class DataStoreFactory {
	private workspacesRepository?: WorkspacesRepository;

	getWorkspacesRepository(): WorkspacesRepository {
		if (!this.workspacesRepository) {
			const baseRepo = new BaseRepository<Workspace>('workspaces', this.storage);
			this.workspacesRepository = new WorkspacesRepository(baseRepo);
		}
		return this.workspacesRepository;
	}

	// Update getWorkspacesService to inject repository
	getWorkspacesService(): WorkspacesService {
		if (!this.workspacesService) {
			this.workspacesService = new WorkspacesService(
				this.getWorkspacesRepository(), // NEW
				this.getWorkspaceMetadataRepository(),
				this.getWorkspaceCreationService(),
				this.getOrchestratorWrapper(),
				this.getEventBroadcaster(),
				this
			);
		}
		return this.workspacesService;
	}
}
```

---

### Phase 9: Update Project-Workspace Relationship

Currently, Projects have `workspaceIds: string[]`. This remains unchanged, but we need to ensure consistency:

#### 9.1 Cascade Updates

**When workspace deleted:**

```typescript
// WorkspacesService.deleteWorkspace()
async deleteWorkspace(workspaceId: string): Promise<void> {
  const workspace = this.repository.findById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  // 1. Remove from all projects
  const projects = this.projectsRepo.query()
    .where('workspaceIds', 'contains', workspaceId)
    .execute();

  for (const project of projects) {
    await this.projectsService.removeWorkspace(project.id, workspaceId);
  }

  // 2. Delete workspace scripts
  const scripts = this.workspaceScriptsRepo.findByWorkspace(workspaceId);
  for (const script of scripts) {
    this.workspaceScriptsRepo.delete(script.id);
  }

  // 3. Archive or delete tasks
  const tasks = this.tasksRepo.query()
    .where('workspaceId', '=', workspaceId)
    .execute();
  for (const task of tasks) {
    this.tasksRepo.update(task.id, { status: 'cancelled' });
  }

  // 4. Delete metadata file
  await this.metadataRepository.deleteMetadata(workspace.path);

  // 5. Delete from database
  this.repository.delete(workspaceId);

  // 6. Emit event
  this.eventBroadcaster.broadcast(B2F_WORKSPACE_DELETED, { workspaceId });
}
```

---

## Critical Files Summary

### New Files

- `packages/web-backend/src/repositories/WorkspacesRepository.ts` - Workspace DB repository
- `packages/web-backend/src/migrations/MigrateWorkspacesToDatabase.ts` - Migration from files to DB
- `packages/web-backend/src/scripts/migrate-workspaces.ts` - CLI migration script

### Modified Files

- `packages/shared-frontend-backend/src/api/workspaces.contract.ts` - Add persistence fields to schema
- `packages/web-backend/src/services/WorkspacesService.ts` - Refactor to use DB instead of orchestrator
- `packages/web-backend/src/orchestrator/OrchestratorEventBridge.ts` - Add workspace registration on worker connect/disconnect
- `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts` - Two-way sync with DB
- `packages/web-backend/src/factories/DataStoreFactory.ts` - Add WorkspacesRepository
- `packages/web-backend/src/storage/FileBasedStorage.ts` - Add 'workspaces' table

---

## Benefits of This Architecture

### 1. **Always-Visible Workspaces**

- All workspaces visible in UI regardless of worker connection
- Newly created workspaces appear immediately
- "Inactive" workspaces clearly marked (no worker running)

### 2. **Centralized Source of Truth**

- Database is authoritative source for workspace inventory
- No more dependency on in-memory orchestrator state
- Server restart doesn't lose workspace tracking

### 3. **Better User Experience**

- Create workspace → See it instantly in list
- Filter by status: active (worker running) vs inactive
- Historical data: lastConnectedAt shows when workspace was last used

### 4. **Simplified Architecture**

- `WorkspacesService.getWorkspacesList()` becomes simple DB query
- Remove complex deduplication and enrichment logic
- No more orchestrator-backend data synchronization issues

### 5. **Scalability**

- Easy to add pagination, advanced filtering, full-text search
- Can track workspace metrics (connection count, uptime, etc.)
- Foundation for workspace quotas, billing, permissions

### 6. **Data Integrity**

- Optimistic locking prevents concurrent modification conflicts
- Cascade delete maintains referential integrity
- Audit trail via timestamps

---

## Migration Plan

### Step 1: Database Setup (Safe)

- Add Workspace table to schema
- Create WorkspacesRepository
- No impact on existing system

### Step 2: Dual-Write (Safe)

- Worker connections write to both memory AND database
- `getWorkspacesList()` still reads from orchestrator
- Database gradually populated

### Step 3: Validation (Safe)

- Compare orchestrator data vs DB data
- Ensure consistency
- Fix any discrepancies

### Step 4: Cutover (Risky)

- Switch `getWorkspacesList()` to read from DB
- Keep orchestrator fallback for 1 release
- Monitor for issues

### Step 5: Cleanup (Safe)

- Remove orchestrator-based workspace tracking code
- Remove deduplication logic
- Simplify WorkspacesService

---

## Rollback Strategy

If issues arise:

1. Revert `getWorkspacesList()` to query orchestrator
2. Keep DB writes (for future retry)
3. Fix bugs in workspace registration logic
4. Retry cutover when stable

---

## Testing Strategy

### Unit Tests

- `WorkspacesRepository` - CRUD operations, upsert logic
- `WorkspacesService.registerWorkerWorkspace()` - Registration flow
- `WorkspacesService.unregisterWorkerWorkspace()` - Disconnection handling
- `WorkspacesService.getWorkspacesList()` - DB query logic

### Integration Tests

- Worker connection → Workspace appears in DB
- Worker disconnection → Workspace marked inactive
- Create workspace via UI → Appears in list immediately
- Update workspace → Metadata file synced
- Delete workspace → Cascade to projects, scripts, tasks

### Manual Testing

1. Start fresh: No workers connected
2. Create workspace via UI → Verify appears in list (status: inactive)
3. Start worker in that workspace → Verify status changes to active
4. Stop worker → Verify status changes to inactive (but still visible)
5. Restart backend → Verify workspace list persists
6. Edit workspace name → Verify metadata file updated
7. Edit metadata file → Verify DB updated

---

## Open Questions for User

1. **Metadata File Retention:** Keep `.agent-fleet/workspace-metadata.json` files for backward compatibility, or migrate fully to DB?
    - **Option A**: Keep both (two-way sync) - safer, gradual migration
    - **Option B**: DB only - cleaner, but requires worker updates

2. **Workspace Discovery:** For existing workspaces without metadata files, should we:
    - **Option A**: Scan filesystem on startup (expensive)
    - **Option B**: Lazy discovery (when worker connects)
    - **Option C**: Manual registration via UI

3. **Inactive Workspace Cleanup:** Should we:
    - **Option A**: Auto-archive workspaces not used in 90 days
    - **Option B**: Manual cleanup only
    - **Option C**: Soft delete with recovery period

4. **Worker Authentication:** Currently no auth - should we:
    - **Option A**: Add worker tokens (validates workspace ownership)
    - **Option B**: Trust model (any worker can register any path)

---

## Verification Checklist

After implementation:

- [ ] Create workspace via UI → Appears immediately in list
- [ ] Worker connects → Workspace status changes to "active"
- [ ] Worker disconnects → Workspace status changes to "inactive"
- [ ] Restart backend → Workspace list persists (loaded from DB)
- [ ] Update workspace via API → Metadata file synced
- [ ] Edit metadata file manually → DB updated on next file watch event
- [ ] Delete workspace → Removed from projects, scripts archived, tasks cancelled
- [ ] Run migration script → All existing workspaces imported
- [ ] Filter by status → Active vs inactive workspaces correctly filtered
- [ ] Search workspaces → Full-text search works across name, path, description
