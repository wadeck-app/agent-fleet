# Implementation Plan: Workspace Creation from Application

## Overview

Add the ability to create workspaces directly from the application UI, with options to:

- Create an empty folder
- Clone a git repository into the folder
- Create a git worktree (linked to an existing workspace)

User can initiate creation from both WorkspacesPage and ProjectsV2Page.

---

## User Decisions

- **Git URL Storage**: Add `gitRepositoryUrl` field to Project model
- **UI Entry Points**: Both WorkspacesPage and ProjectsV2Page
- **Git Operations**: Synchronous (blocking) for initial implementation
- **Authentication**: Use system git credentials (SSH keys, credential helpers)

---

## Implementation Phases

### Phase 1: Backend Data Model & Contract

#### 1.1 Update Project Schema

**File**: `packages/shared-frontend-backend/src/api/projects.contract.ts`

Add optional git repository fields:

```typescript
export const ProjectSchema = z.object({
	// ... existing fields
	gitRepositoryUrl: z.string().url().optional(),
	gitDefaultBranch: z.string().optional().default('main'),
});
```

#### 1.2 Create Workspace Creation Contract

**File**: `packages/shared-frontend-backend/src/api/workspaces.contract.ts`

Add new schemas:

```typescript
export const CreateWorkspaceDtoSchema = z.object({
	path: z.string().min(1, 'Path is required'),
	name: z.string().optional(),
	description: z.string().optional(),
	color: WorkspaceColorSchema.optional(),
	mode: WorkspaceModeSchema.optional().default('development'),

	gitOptions: z
		.object({
			strategy: z.enum(['none', 'clone', 'worktree']),
			repositoryUrl: z.string().url().optional(), // For clone
			sourceWorkspaceId: z.string().optional(), // For worktree
			branch: z.string().optional(), // Branch to checkout/create
		})
		.optional(),
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceDtoSchema>;
```

Update routes:

```typescript
export const WORKSPACES_API_ROUTES = defineRoutes({
  '/api/workspaces/': {
    GET: { ... }, // existing
    POST: { // new
      body: CreateWorkspaceDtoSchema,
      response: WorkspaceSchema,
    },
  },
});
```

#### 1.3 Create Migration for Projects

**File**: `packages/web-backend/src/migrations/AddGitFieldsToProjects.ts`

Add migration to populate `gitRepositoryUrl` and `gitDefaultBranch` fields (null for existing projects).

---

### Phase 2: Backend Services

#### 2.1 Create WorkspaceGitService

**File**: `packages/web-backend/src/services/WorkspaceGitService.ts`

Install dependency first: `npm install --workspace=packages/web-backend simple-git`

Responsibilities:

- `cloneRepository(repoUrl, targetPath, branch, shallow)` - Clone repository
- `createWorktree(sourceWorkspacePath, targetPath, branch)` - Create git worktree
- `getGitState(workspacePath)` - Read branch, status, commit hash
- Path validation and security checks

**Reference implementation from**: `packages/flow-engine/src/workspace/WorkspaceManager.ts:414-500`

Key patterns to reuse:

- Use `simpleGit()` for git operations
- Clone with options: `git.clone(repoUrl, targetPath, ['--depth', '1'])` for shallow
- Worktree: `git.raw(['worktree', 'add', targetPath, branchName])`
- Git state: `git.status()`, `git.log({ maxCount: 1 })`
- Use system credentials (no custom auth needed)

#### 2.2 Create WorkspacePathValidator

**File**: `packages/web-backend/src/services/WorkspacePathValidator.ts`

Responsibilities:

- `validatePath(path)` - Ensure path is valid and safe
- `isPathAbsolute(path)` - Check if path is absolute
- `isPathSafe(path)` - Check for path traversal, symlinks
- `isPathWritable(path)` - Check write permissions
- `pathExists(path)` - Check if path already exists

Security checks:

- Must be absolute path
- No `..` segments after resolution
- Not in system directories (/etc, C:\Windows, etc.)
- Writable by process user
- Doesn't conflict with existing workspaces

#### 2.3 Create WorkspaceCreationService

**File**: `packages/web-backend/src/services/WorkspaceCreationService.ts`

Orchestrates workspace creation flow:

```typescript
async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
  // 1. Validate path
  await this.pathValidator.validatePath(data.path);

  // 2. Create directory if doesn't exist
  await mkdir(data.path, { recursive: true });

  // 3. Execute git operations based on strategy
  if (data.gitOptions?.strategy === 'clone') {
    await this.gitService.cloneRepository(...);
  } else if (data.gitOptions?.strategy === 'worktree') {
    await this.gitService.createWorktree(...);
  }

  // 4. Initialize workspace metadata
  const metadata = await this.metadataFile.write(data.path, {
    name: data.name,
    description: data.description,
    color: data.color,
    mode: data.mode,
  });

  // 5. Return workspace DTO
  return WorkspaceMapper.mapPathToWorkspace(data.path, metadata);
}
```

#### 2.4 Update WorkspacesService

**File**: `packages/web-backend/src/services/WorkspacesService.ts`

Add method (around line 333, where placeholder comment exists):

```typescript
async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
  log.info('Creating workspace', { path: data.path });

  try {
    const workspace = await this.creationService.createWorkspace(data);

    // Start watching metadata file
    this.metadataRepository.startWatching(data.path);

    // Emit event
    this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {} as any);

    log.info('Successfully created workspace', { id: workspace.id });
    return workspace;
  } catch (error) {
    log.error('Failed to create workspace:', error);
    throw error;
  }
}
```

**Pattern reference**: See `updateWorkspace` method at line 340-404.

#### 2.5 Update Controller

**File**: `packages/web-backend/src/controllers/WorkspacesWithScriptsController.ts`

Add POST route:

```typescript
add('POST', '/api/workspaces/', async ({ body }) => {
	return this.workspacesService.createWorkspace(body);
});
```

---

### Phase 3: Frontend Components

#### 3.1 Create CreateWorkspaceDialog

**File**: `packages/web-frontend/src/app/pages/workspaces/CreateWorkspaceDialog.tsx`

Form fields:

- **Path** (FolderField or Input) - Absolute path input
- **Name** (Input, optional) - Display name
- **Description** (Input, optional)
- **Color** (ColorPicker) - Workspace color
- **Mode** (Select, optional) - development/production/staging

Git Options (conditional section):

- **Strategy** (RadioGroup):
    - "None" - Empty folder
    - "Clone Repository" - Shows URL + branch inputs
    - "Git Worktree" - Shows source workspace selector + branch input

**Pattern reference**: `packages/web-frontend/src/app/pages/workspaces/EditWorkspaceDialog.tsx`

Key patterns to reuse:

- Dialog structure with open/onClose props
- Form state with useState hooks
- Save handler with loading state (`isSaving`)
- Error handling with error state
- ColorPicker integration

Conditional rendering:

```typescript
{gitStrategy === 'clone' && (
  <>
    <Input label="Repository URL" value={repoUrl} onChange={...} />
    <Input label="Branch" value={branch} onChange={...} />
  </>
)}
```

#### 3.2 Update WorkspacesPage

**File**: `packages/web-frontend/src/app/pages/workspaces/WorkspacesPage.tsx`

Add button in PageHeader actions:

```typescript
<Button onClick={() => setCreateDialogOpen(true)}>
  <Plus className="h-4 w-4 mr-2" />
  Create Workspace
</Button>

<CreateWorkspaceDialog
  open={createDialogOpen}
  onClose={() => setCreateDialogOpen(false)}
  onSave={handleCreateWorkspace}
/>
```

#### 3.3 Update ProjectsV2Page

**File**: `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

Add "Create Workspace" option in project context menu or as action button in project panel.

When creating from a project:

- Pre-fill `gitRepositoryUrl` from project if available
- Pre-fill `branch` from project's `gitDefaultBranch`

#### 3.4 Create API Client Method

**File**: `packages/web-frontend/src/app/pages/workspaces/workspaces.api.ts`

Add:

```typescript
createWorkspace: (data: CreateWorkspaceDto): Promise<Workspace> => {
	return httpClient.post('/api/workspaces/', data);
};
```

---

### Phase 4: Project UI Updates

#### 4.1 Update CreateProjectDialog

**File**: `packages/web-frontend/src/app/pages/projects2/CreateProjectDialog.tsx`

Add optional fields:

- **Git Repository URL** (Input with URL validation)
- **Default Branch** (Input, default: "main")

#### 4.2 Update EditProjectDialog

**File**: `packages/web-frontend/src/app/pages/projects2/EditProjectDialog.tsx`

Add same fields as CreateProjectDialog for editing.

---

### Phase 5: Testing

#### 5.1 Backend Tests

**File**: `packages/web-backend/src/services/WorkspaceGitService.test.ts`

- Clone repository (mocked git)
- Create worktree (mocked git)
- Path validation edge cases
- Git error handling

**File**: `packages/web-backend/src/services/WorkspaceCreationService.test.ts`

- Create empty workspace
- Create workspace with clone
- Create workspace with worktree
- Error handling (invalid path, git failure)

**File**: `packages/web-backend/src/services/WorkspacesService.test.ts`

- `createWorkspace` integration
- Event emission verification

#### 5.2 Frontend Tests

**File**: `packages/web-frontend/src/app/pages/workspaces/CreateWorkspaceDialog.test.tsx`

- Form rendering
- Validation (path required, URL format)
- Git strategy selection
- Submit handling

---

## Critical Files Summary

### Backend

- `packages/shared-frontend-backend/src/api/projects.contract.ts` - Add git URL fields
- `packages/shared-frontend-backend/src/api/workspaces.contract.ts` - Add CreateWorkspaceDto
- `packages/web-backend/src/services/WorkspaceGitService.ts` - New service (git operations)
- `packages/web-backend/src/services/WorkspacePathValidator.ts` - New service (validation)
- `packages/web-backend/src/services/WorkspaceCreationService.ts` - New service (orchestration)
- `packages/web-backend/src/services/WorkspacesService.ts` - Add createWorkspace method
- `packages/web-backend/src/controllers/WorkspacesWithScriptsController.ts` - Add POST route

### Frontend

- `packages/web-frontend/src/app/pages/workspaces/CreateWorkspaceDialog.tsx` - New dialog
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesPage.tsx` - Add create button
- `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx` - Add create action
- `packages/web-frontend/src/app/pages/workspaces/workspaces.api.ts` - Add createWorkspace

### Reference Implementation

- `packages/flow-engine/src/workspace/WorkspaceManager.ts` - Git operations patterns

---

## Security Considerations

### Path Security

- Validate absolute paths only
- Check for path traversal (`..` segments)
- Block system directories
- Verify write permissions before creation

### Git Security

- Use system credentials (SSH keys, credential helpers)
- No custom credential storage needed
- Timeout git operations (30s default)
- Validate repository URLs (https://, git://, file://)
- Validate branch names (alphanumeric + limited special chars)

### Error Handling

- Graceful failure messages
- Cleanup on failure (remove partially created directories)
- Don't expose system paths in error messages
- Log detailed errors server-side

---

## User-Facing Error Messages

- "Path is required"
- "Path must be absolute"
- "Path already exists"
- "Permission denied - cannot write to path"
- "Invalid path - contains unsafe characters"
- "Git repository not found or inaccessible"
- "Git operation timeout - check network connection"
- "Branch not found in repository"
- "Insufficient disk space"

---

## Verification Strategy

### Automated Integration Tests

**File**: `packages/web-backend/src/services/WorkspaceCreation.integration.test.ts`

Use temporary directories with automatic cleanup:

```typescript
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Workspace Creation Integration', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create unique temp directory for each test
		tempDir = await mkdtemp(join(tmpdir(), 'workspace-test-'));
	});

	afterEach(async () => {
		// Cleanup temp directory
		await rm(tempDir, { recursive: true, force: true });
	});

	describe('Empty workspace creation', () => {
		it('should create workspace with absolute path', async () => {
			const workspacePath = join(tempDir, 'test-workspace');
			const result = await workspaceCreationService.createWorkspace({
				path: workspacePath,
				name: 'Test Workspace',
			});

			expect(result.path).toBe(workspacePath);
			expect(fs.existsSync(workspacePath)).toBe(true);
		});

		it('should create .agent-fleet/workspace-metadata.json', async () => {
			const workspacePath = join(tempDir, 'test-workspace');
			await workspaceCreationService.createWorkspace({ path: workspacePath });

			const metadataPath = join(workspacePath, '.agent-fleet', 'workspace-metadata.json');
			expect(fs.existsSync(metadataPath)).toBe(true);

			const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
			expect(metadata.id).toBeDefined();
			expect(metadata.createdAt).toBeDefined();
		});
	});

	describe('Git clone creation', () => {
		it('should clone public repository', async () => {
			const workspacePath = join(tempDir, 'cloned-workspace');
			const result = await workspaceCreationService.createWorkspace({
				path: workspacePath,
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/test-repo.git',
					branch: 'main',
				},
			});

			expect(fs.existsSync(join(workspacePath, '.git'))).toBe(true);
			expect(result.gitBranch).toBe('main');
		});

		it('should verify correct branch checked out', async () => {
			const workspacePath = join(tempDir, 'cloned-workspace');
			await workspaceCreationService.createWorkspace({
				path: workspacePath,
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/test-repo.git',
					branch: 'develop',
				},
			});

			const git = simpleGit(workspacePath);
			const status = await git.status();
			expect(status.current).toBe('develop');
		});
	});

	describe('Git worktree creation', () => {
		it('should create worktree from source workspace', async () => {
			// Setup: Create source workspace with git repo
			const sourceWorkspace = join(tempDir, 'source-workspace');
			await initTestGitRepo(sourceWorkspace);

			// Test: Create worktree
			const worktreePath = join(tempDir, 'worktree-workspace');
			const result = await workspaceCreationService.createWorkspace({
				path: worktreePath,
				gitOptions: {
					strategy: 'worktree',
					sourceWorkspaceId: 'source-id',
					branch: 'feature-branch',
				},
			});

			expect(fs.existsSync(worktreePath)).toBe(true);
			expect(result.gitBranch).toBe('feature-branch');
		});

		it('should verify independent working directories', async () => {
			const sourceWorkspace = join(tempDir, 'source');
			const worktree1 = join(tempDir, 'worktree1');
			const worktree2 = join(tempDir, 'worktree2');

			await initTestGitRepo(sourceWorkspace);

			await workspaceCreationService.createWorkspace({
				path: worktree1,
				gitOptions: { strategy: 'worktree', sourceWorkspaceId: 'src', branch: 'branch1' },
			});

			await workspaceCreationService.createWorkspace({
				path: worktree2,
				gitOptions: { strategy: 'worktree', sourceWorkspaceId: 'src', branch: 'branch2' },
			});

			// Verify isolation
			fs.writeFileSync(join(worktree1, 'test.txt'), 'worktree1');
			expect(fs.existsSync(join(worktree2, 'test.txt'))).toBe(false);
		});
	});

	describe('Error handling', () => {
		it('should cleanup on git clone failure', async () => {
			const workspacePath = join(tempDir, 'failed-workspace');

			await expect(
				workspaceCreationService.createWorkspace({
					path: workspacePath,
					gitOptions: {
						strategy: 'clone',
						repositoryUrl: 'https://github.com/user/nonexistent-repo.git',
					},
				})
			).rejects.toThrow();

			// Verify partial directory cleaned up
			expect(fs.existsSync(workspacePath)).toBe(false);
		});
	});
});
```

### Running Tests

```bash
# Run all tests
npm run test --workspace=packages/web-backend

# Run specific test file
npm run test --workspace=packages/web-backend -- WorkspaceCreation.integration.test.ts

# Run with coverage
npm run test:coverage --workspace=packages/web-backend
```
