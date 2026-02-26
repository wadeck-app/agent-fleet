# Plan: File Browser with Tree + CodeMirror Editor

## Context

The projects-v2 page (`/projects-v2`) currently has two view tabs per workspace: **Tasks** and **Scripts**. The user wants a third **Files** tab that provides a GitHub-style file browser: a file tree on the left (lazy-loaded) and a CodeMirror 6 editor on the right for viewing and editing files within the selected workspace's directory.

No file browsing API exists yet in the backend. The workspace model has a `path` property (absolute filesystem path) which will be the root for browsing.

---

## Overview

Three main work streams:

1. **Shared contract** - Define API schemas for file operations
2. **Backend** - New service + controller routes for listing directories and reading/writing files
3. **Frontend** - New "Files" tab with FileTree + CodeMirror editor (delegate to `frontend-dev` agent)

---

## 1. Shared Contract: `workspaceFiles.contract.ts`

**File:** `packages/shared-frontend-backend/src/api/workspaceFiles.contract.ts`

Define Zod schemas and routes using `defineRoutes()`:

```
GET  /api/workspaces/:workspaceId/files/tree     → list directory (lazy)
GET  /api/workspaces/:workspaceId/files/content   → read file
PUT  /api/workspaces/:workspaceId/files/content   → write file
```

**Schemas:**

- `FileEntrySchema`: `{ name, path (relative), type: 'file' | 'directory', size?, lastModified? }`
- `DirectoryListingSchema`: `{ entries: FileEntry[], path: string }`
- `FileContentSchema`: `{ path: string, content: string, size: number, lastModified: string }`
- `WriteFileBodySchema`: `{ content: string }`
- Query params: `{ path: z.string() }` (relative path within workspace)

**Register in:**

- `packages/shared-frontend-backend/src/types.ts` → add to `ALL_API_ROUTES` and `ALL_CONTRACTS`

---

## 2. Backend: File Service + Controller Routes

### 2a. `WorkspaceFileService.ts`

**File:** `packages/web-backend/src/services/WorkspaceFileService.ts`

**Dependencies (constructor injection):**

- `WorkspacesService` — to resolve workspaceId → workspace path

**Methods:**

- `listDirectory(workspacePath: string, relativePath: string): Promise<DirectoryListing>`
    - `readdir` with `withFileTypes: true`
    - Sort: directories first, then alphabetical
    - Return `{ name, path, type, size, lastModified }` for each entry
    - Exclude `.git`, `node_modules` by default (configurable later)
- `readFile(workspacePath: string, relativePath: string): Promise<FileContent>`
    - Read file with `fs/promises.readFile`
    - Size limit check (e.g. 1MB max for text files)
    - Return `{ path, content, size, lastModified }`
- `writeFile(workspacePath: string, relativePath: string, content: string): Promise<FileContent>`
    - Write file with `fs/promises.writeFile`
    - Return updated file metadata

**Security (private method):**

- `resolveAndValidatePath(workspacePath: string, relativePath: string): string`
    - `path.resolve(workspacePath, relativePath)`
    - Verify resolved path starts with `workspacePath` (containment check)
    - Reject `..` traversal, null bytes, symlinks outside workspace
    - Reuse patterns from `WorkspacePathValidator.ts`

### 2b. Integrate into `WorkspacesWithScriptsController.ts`

**File:** `packages/web-backend/src/controllers/WorkspacesWithScriptsController.ts`

- Merge `WORKSPACE_FILES_API_ROUTES` into `MERGED_ROUTES`
- Add `WorkspaceFileService` as constructor dependency
- Add three route handlers in `configureRoutes()`:
    - `GET /api/workspaces/:workspaceId/files/tree` → `listDirectory()`
    - `GET /api/workspaces/:workspaceId/files/content` → `readFile()`
    - `PUT /api/workspaces/:workspaceId/files/content` → `writeFile()`

### 2c. Wire in `DataStoreFactory.ts`

**File:** `packages/web-backend/src/factories/DataStoreFactory.ts`

- Add `getWorkspaceFileService()` method
- Update the workspaces controller instantiation to inject `WorkspaceFileService`

### 2d. Update lazy controller injection

**File:** `packages/web-backend/src/utils/lazy-controller-plugin.ts`

- Update the `/api/workspaces` branch to also pass `workspaceFileService`

---

## 3. Frontend: Files Tab + FileTree + CodeMirror Editor

> **BLOCKING:** All frontend changes must be delegated to `frontend-dev` agent per CLAUDE.md rules.

### 3a. Install dependencies

```
npm install @codemirror/state @codemirror/view @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-html @codemirror/lang-css @codemirror/lang-markdown @codemirror/lang-python @codemirror/lang-yaml @codemirror/theme-one-dark codemirror
```

In `packages/web-frontend/package.json`.

### 3b. API client

**File:** `packages/web-frontend/src/app/pages/projects2/files/workspaceFiles.api.ts`

Using existing `createTypedFetch` pattern from `api-base.ts`:

- `listDirectory(workspaceId, path)`
- `readFile(workspaceId, path)`
- `writeFile(workspaceId, path, content)`

### 3c. Extend view tabs

**Files to modify:**

- `WorkspaceViewTabs.tsx` → add "Files" tab, extend type to `'tasks' | 'scripts' | 'files'`
- `WorkspacePanel.tsx` → add `activeView === 'files'` branch rendering `FileBrowserPanel`
- `ProjectsV2Page.tsx` → extend view type cast to include `'files'`

### 3d. New components

All in `packages/web-frontend/src/app/pages/projects2/files/`:

| Component                | Responsibility                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `FileBrowserPanel.tsx`   | Split layout: tree (left) + editor (right). Manages selected file state.                     |
| `FileTree.tsx`           | Recursive tree with lazy-loaded folders. Click folder → fetch children. Click file → select. |
| `FileTreeNode.tsx`       | Single tree node (folder/file) with expand/collapse, icons.                                  |
| `FileEditorPanel.tsx`    | Wrapper: breadcrumb + editor + Save/Discard buttons. Uses the abstracted editor.             |
| `useDirectoryListing.ts` | Hook: fetch directory contents for a path.                                                   |
| `useFileContent.ts`      | Hook: fetch/save file content.                                                               |

**Editor abstraction layer** (in `packages/web-frontend/src/framework/components/editor/`):

| File                   | Responsibility                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `CodeEditorTypes.ts`   | Interface `CodeEditorProps { value, onChange, language, readOnly, className }`        |
| `CodeMirrorEditor.tsx` | CodeMirror 6 implementation of `CodeEditorProps`                                      |
| `CodeEditor.tsx`       | Re-export — single import point. Swap implementation here without touching consumers. |
| `languageDetection.ts` | Map file extensions → language identifiers (shared, editor-agnostic)                  |

This way, `FileEditorPanel` imports `CodeEditor` (the abstraction), not CodeMirror directly. To switch to Monaco or another editor later, only `CodeEditor.tsx` and the implementation file change.

**Layout:**

```
┌──────────────┬──────────────────────────────────┐
│  FileTree    │  FileEditorPanel                 │
│  (250px)     │  ┌─ breadcrumb: src/app.ts ────┐ │
│              │  │                              │ │
│  📁 src      │  │  CodeEditor (abstract)       │ │
│    📄 app.ts │  │  import { ... } from '...'   │ │
│    📁 utils  │  │                              │ │
│  📁 tests    │  └──────────────────────────────┘ │
│  📄 README   │  [Save] [Discard]                │
└──────────────┴──────────────────────────────────┘
```

- Resizable split pane (CSS `resize` or simple draggable divider)
- File icons from Lucide: `File`, `Folder`, `FolderOpen`
- Language detection from file extension (in shared `languageDetection.ts`)
- Dark theme via `@codemirror/theme-one-dark`
- Breadcrumb showing current file path above editor

---

## 4. Tests

### Backend

- `WorkspaceFileService.test.ts` — unit tests with temp directories
    - Test `listDirectory`, `readFile`, `writeFile`
    - Test path traversal rejection (`../`, symlinks, null bytes)
    - Test size limit enforcement
    - Test hidden folder exclusion

### Frontend

- `FileTree.test.tsx` — render tree, expand folders, select files
- `FileBrowserPanel.test.tsx` — integration of tree + editor
- `CodeMirrorEditor.test.tsx` — CodeMirror mount, content display, onChange callback
- `FileEditorPanel.test.tsx` — breadcrumb, save/discard buttons, dirty state

---

## 5. Key Files to Modify

| File                                                                | Change                              |
| ------------------------------------------------------------------- | ----------------------------------- |
| `shared-frontend-backend/src/api/workspaceFiles.contract.ts`        | **NEW** - API schemas               |
| `shared-frontend-backend/src/types.ts`                              | Register new contract               |
| `web-backend/src/services/WorkspaceFileService.ts`                  | **NEW** - File operations service   |
| `web-backend/src/controllers/WorkspacesWithScriptsController.ts`    | Add file routes                     |
| `web-backend/src/factories/DataStoreFactory.ts`                     | Wire WorkspaceFileService           |
| `web-backend/src/utils/lazy-controller-plugin.ts`                   | Pass new service to controller      |
| `web-frontend/package.json`                                         | Add CodeMirror deps                 |
| `web-frontend/src/app/pages/projects2/WorkspaceViewTabs.tsx`        | Add "Files" tab                     |
| `web-frontend/src/app/pages/projects2/WorkspacePanel.tsx`           | Render FileBrowserPanel             |
| `web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`           | Extend view type                    |
| `web-frontend/src/framework/components/editor/CodeEditorTypes.ts`   | **NEW** - Editor interface          |
| `web-frontend/src/framework/components/editor/CodeMirrorEditor.tsx` | **NEW** - CodeMirror implementation |
| `web-frontend/src/framework/components/editor/CodeEditor.tsx`       | **NEW** - Re-export (swap point)    |
| `web-frontend/src/framework/components/editor/languageDetection.ts` | **NEW** - Extension → language map  |
| `web-frontend/src/app/pages/projects2/files/*.tsx`                  | **NEW** - File browser components   |

---

## 6. Execution Order

1. Shared contract (needed by both backend and frontend)
2. Backend service + controller + factory wiring + tests
3. Frontend components (delegated to `frontend-dev` agent)
4. Run `check` skill + full test suite

---

## 7. Verification

1. **Backend:** `curl GET /api/workspaces/:id/files/tree?path=.` returns directory listing
2. **Backend:** `curl GET /api/workspaces/:id/files/content?path=package.json` returns file content
3. **Backend:** `curl PUT /api/workspaces/:id/files/content?path=test.txt` with body `{ "content": "hello" }` writes file
4. **Frontend:** Navigate to `/projects-v2`, select a workspace, click "Files" tab
5. **Frontend:** Click folders in tree → lazy loads children
6. **Frontend:** Click a file → content appears in CodeMirror editor
7. **Frontend:** Edit file → click Save → changes persisted
8. **Security:** Attempting `?path=../../etc/passwd` returns 400 error
9. Run `check` skill — no TypeScript/ESLint errors
10. Run `run-test` skill — all tests pass
