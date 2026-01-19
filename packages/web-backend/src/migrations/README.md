# Backend Storage Migrations

This directory contains migration scripts for the backend storage layer.

## Available Migrations

### MigrateToBackendStorage.ts

Migrates existing tasks from orchestrator's file-based storage to backend storage.

**Purpose:** Consolidate task storage from orchestrator's individual JSON files to backend's centralized storage format.

**From:** `./packages/orchestrator/data/tasks/{taskId}.json` (orchestrator format)
**To:** `./packages/web-backend/data/tasks.json` (backend format)

#### Key Transformations

- `assignedTo` → `assignedWorker` (field rename)
- `metadata.projectId` → `projectId` (extract to top level)
- `metadata.workspaceId` → `workspaceId` (extract to top level)
- Add `version: 1` field (for optimistic locking)
- Remove orchestrator-specific fields (comments, history, metadata, etc.)

#### Usage

**Dry-run mode** (preview changes without making modifications):

```bash
cd packages/web-backend
npm run migrate -- --dry-run
```

**Actual migration**:

```bash
cd packages/web-backend
npm run migrate
```

#### Safety Features

- **Backup**: Creates backup at `./packages/orchestrator/data/tasks.backup/` before migration
- **Validation**: Validates all tasks before writing
- **Error handling**: Logs errors but continues processing other tasks
- **Summary**: Displays migration statistics at the end

#### Example Output

```
===========================================================================================
ORCHESTRATOR TO BACKEND STORAGE MIGRATION
===========================================================================================

[Migration] Starting migration...
[Migration] Dry-run mode: false

[Migration] Reading orchestrator tasks...
[Migration] Found 3 tasks

[Migration] Creating backup...
[Migration] Backed up 3 task files to C:\...\packages\orchestrator\data\tasks.backup

[Migration] Writing tasks to backend storage...
[Migration] Wrote 3 tasks to C:\...\packages\web-backend\data\tasks.json

===========================================================================================
MIGRATION SUMMARY
===========================================================================================
Total tasks: 3
Successfully migrated: 3
Failed: 0
Skipped: 0

Migration complete!
Backup created at: C:\...\packages\orchestrator\data\tasks.backup
Tasks written to: C:\...\packages\web-backend\data\tasks.json
===========================================================================================
```

#### Testing

Run the test suite to verify migration logic:

```bash
cd packages/web-backend
npm test -- src/migrations/MigrateToBackendStorage.test.ts
```

#### Rollback

If you need to rollback the migration:

1. Delete the backend storage file:

    ```bash
    rm packages/web-backend/data/tasks.json
    ```

2. The backup is preserved at `packages/orchestrator/data/tasks.backup/`
    - Original orchestrator tasks remain in `packages/orchestrator/data/tasks/`
    - The migration does NOT delete orchestrator task files

## Adding New Migrations

When creating new migrations:

1. Create a new file: `src/migrations/MigrateSomething.ts`
2. Export transformation and validation functions
3. Add comprehensive tests: `src/migrations/MigrateSomething.test.ts`
4. Add npm script to `package.json`
5. Document in this README

### Migration Template

```typescript
import { readFile, writeFile } from 'fs/promises';

/**
 * Main migration function
 */
async function migrate(dryRun: boolean): Promise<MigrationStats> {
	// 1. Read source data
	// 2. Transform data
	// 3. Validate data
	// 4. Create backup (if not dry-run)
	// 5. Write to destination (if not dry-run)
	// 6. Return statistics
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');
	const stats = await migrate(dryRun);
	// Display results
}

// Run if called directly
if (isMainModule) {
	main().catch(console.error);
}

export { migrate };
```
