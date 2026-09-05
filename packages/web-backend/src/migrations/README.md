# Backend Storage Migrations

This directory contains migration scripts for the backend storage layer.

## Available Migrations

### RemoveWorkspaceProjectIdMigration.ts (2026-01-24)

Removes `projectId` from workspace metadata files to establish a single source of truth in `project.workspaceIds[]`.

**Purpose:** Eliminate bidirectional relationship between Workspace and Project. Previously, associations were stored both ways (`workspace.projectId` and `project.workspaceIds`), causing synchronization bugs and complex logic.

**What it does:**

1. Reads workspace metadata files that have `projectId`
2. Verifies the project exists and contains the workspace in `workspaceIds[]`
3. If not, adds the workspace to repair inconsistencies
4. Removes `projectId` from the metadata file

#### Usage

**Migrate specific workspaces:**

```bash
cd packages/web-backend
npm run migrate:remove-workspace-projectid -- --workspace-paths "/path/to/workspace1,/path/to/workspace2"
```

**Dry run (preview without changes):**

```bash
cd packages/web-backend
npm run migrate:remove-workspace-projectid -- --dry-run --workspace-paths "/path/to/workspace"
```

#### Safety Features

- **Repairs inconsistencies**: Adds workspace to project if missing
- **Graceful error handling**: Logs errors but continues processing
- **Migration summary**: Displays statistics (migrated, skipped, errors)

#### Related Documentation

- Migration class: `RemoveWorkspaceProjectIdMigration.ts`
- Tests: `RemoveWorkspaceProjectIdMigration.test.ts`

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
