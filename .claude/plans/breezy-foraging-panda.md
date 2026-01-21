# Plan: Process Management & Logs in ProjectsV2 Workspace Panel

## Contexte

L'utilisateur souhaite ajouter une fonctionnalité de gestion de processus de développement (backend, frontend, etc.) dans la page ProjectsV2, spécifiquement dans le WorkspacePanel. Cette fonctionnalité permettra de:

- Configurer les scripts package.json à exécuter pour un workspace donné
- Démarrer/arrêter ces scripts
- Visualiser les logs en temps réel
- Configurer les liens vers l'application (URL backend/frontend)

## Propositions de Design (ASCII Art)

### Proposition 1: Tabs horizontaux avec vue simple (Recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: my-project (active) [development]                    │
│ 📁 /path/to/workspace  🔀 main                                  │
│ [Edit] [Configure Scripts]                                      │
├─────────────────────────────────────────────────────────────────┤
│ View Mode: [📋 Tasks] [▶️ Scripts]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Scripts Panel:                                                   │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ [dev:backend ●] [dev:frontend ●] [build:all] [test:e2e]  │  │
│ ├───────────────────────────────────────────────────────────┤  │
│ │ Selected: dev:backend                                     │  │
│ │                                                           │  │
│ │ 🔴 Running (pid: 12345)    [⏹️ Stop] [♻️ Restart]        │  │
│ │ 🔗 http://localhost:3000                                  │  │
│ │                                                           │  │
│ │ [Full Width]                                              │  │
│ │                                                           │  │
│ │ ┌─────────────────────────────────────────────────────┐  │  │
│ │ │ [14:32:45] info  Server started on port 3000        │  │  │
│ │ │ [14:32:46] info  Database connected                 │  │  │
│ │ │ [14:32:47] debug Loading middleware...              │  │  │
│ │ │ [14:32:48] info  Ready to accept connections        │  │  │
│ │ │                                                      │  │  │
│ │ └─────────────────────────────────────────────────────┘  │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Proposition 2: Split view côte à côte

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: my-project (active) [development]                    │
│ View Mode: [📋 Tasks] [▶️ Scripts]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Scripts Panel:                                                   │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ [dev:backend ●] [dev:frontend ●] [build:all]             │  │
│ ├───────────────────────────────────────────────────────────┤  │
│ │ [Side by Side]                                            │  │
│ │                                                           │  │
│ │ ┌──────────────────────┬──────────────────────────────┐  │  │
│ │ │ dev:backend 🔴       │ dev:frontend 🔴              │  │  │
│ │ │ http://localhost:3000│ http://localhost:5173        │  │  │
│ │ │ [⏹️ Stop] [♻️ Restart]│ [⏹️ Stop] [♻️ Restart]       │  │  │
│ │ ├──────────────────────┼──────────────────────────────┤  │  │
│ │ │ [14:32:45] info      │ [14:35:12] info              │  │  │
│ │ │ Server started       │ Vite dev server              │  │  │
│ │ │                      │                              │  │  │
│ │ │ [14:32:46] info      │ [14:35:13] info              │  │  │
│ │ │ Database connected   │ Ready in 1.2s                │  │  │
│ │ │                      │                              │  │  │
│ │ │ [14:32:47] debug     │ [14:35:14] info              │  │  │
│ │ │ Loading middleware   │ Local: http://localhost:5173 │  │  │
│ │ │                      │                              │  │  │
│ │ └──────────────────────┴──────────────────────────────┘  │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Proposition 3: Multi-panel avec sélecteur dropdown

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: my-project (active) [development]                    │
│ View Mode: [📋 Tasks] [▶️ Scripts]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Scripts Panel:                                                   │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Active Scripts (2 running, 4 configured)                  │  │
│ │                                                           │  │
│ │ Layout: [Full Width ▼]  [+ Add Panel]                    │  │
│ │                                                           │  │
│ │ ┌─────────────────────────────────────────────────────┐  │  │
│ │ │ Panel 1: [dev:backend ▼] 🔴 Running                 │  │  │
│ │ │ http://localhost:3000  [⏹️] [♻️] [⚙️] [✖️]          │  │  │
│ │ ├─────────────────────────────────────────────────────┤  │  │
│ │ │ [14:32:45] info  Server started on port 3000        │  │  │
│ │ │ [14:32:46] info  Database connected                 │  │  │
│ │ └─────────────────────────────────────────────────────┘  │  │
│ │                                                           │  │
│ │ ┌─────────────────────────────────────────────────────┐  │  │
│ │ │ Panel 2: [dev:frontend ▼] 🔴 Running               │  │  │
│ │ │ http://localhost:5173  [⏹️] [♻️] [⚙️] [✖️]          │  │  │
│ │ ├─────────────────────────────────────────────────────┤  │  │
│ │ │ [14:35:12] info  Vite dev server                    │  │  │
│ │ │ [14:35:13] info  Ready in 1.2s                      │  │  │
│ │ └─────────────────────────────────────────────────────┘  │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Proposition 4: Grid layout flexible (2x2 ou 1x2)

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: my-project (active) [development]                    │
│ View Mode: [📋 Tasks] [▶️ Scripts]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Scripts Panel:                                                   │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Layout: [Grid 2x2 ▼]  Active: 4 scripts                  │  │
│ │                                                           │  │
│ │ ┌──────────────────────┬──────────────────────────────┐  │  │
│ │ │ dev:backend 🔴       │ dev:frontend 🔴              │  │  │
│ │ │ http://localhost:3000│ http://localhost:5173        │  │  │
│ │ │ [⏹️] [♻️] [⬜ Expand] │ [⏹️] [♻️] [⬜ Expand]        │  │  │
│ │ ├──────────────────────┼──────────────────────────────┤  │  │
│ │ │ [14:32:45] info      │ [14:35:12] info              │  │  │
│ │ │ Server started       │ Vite dev server              │  │  │
│ │ │ [14:32:46] info      │ [14:35:13] info              │  │  │
│ │ │ Database connected   │ Ready in 1.2s                │  │  │
│ │ ├──────────────────────┼──────────────────────────────┤  │  │
│ │ │ test:watch ⚪        │ build:all ⚪                 │  │  │
│ │ │ [▶️ Start]           │ [▶️ Start]                   │  │  │
│ │ │                      │                              │  │  │
│ │ │ Not running          │ Not running                  │  │  │
│ │ │                      │                              │  │  │
│ │ └──────────────────────┴──────────────────────────────┘  │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Proposition 5: Accordion avec expansion

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: my-project (active) [development]                    │
│ View Mode: [📋 Tasks] [▶️ Scripts]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Scripts Panel:                                                   │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Configured Scripts (4 total)      [+ Add Script]          │  │
│ │                                                           │  │
│ │ ▼ dev:backend                        🔴 Running           │  │
│ │   http://localhost:3000              [⏹️] [♻️] [⚙️]       │  │
│ │   ┌─────────────────────────────────────────────────────┐ │  │
│ │   │ [14:32:45] info  Server started on port 3000        │ │  │
│ │   │ [14:32:46] info  Database connected                 │ │  │
│ │   │ [14:32:47] debug Loading middleware...              │ │  │
│ │   │ [14:32:48] info  Ready to accept connections        │ │  │
│ │   │ [Auto-scroll: ON] [Search] [Filter: All Levels ▼]  │ │  │
│ │   └─────────────────────────────────────────────────────┘ │  │
│ │                                                           │  │
│ │ ▼ dev:frontend                       🔴 Running           │  │
│ │   http://localhost:5173              [⏹️] [♻️] [⚙️]       │  │
│ │   ┌─────────────────────────────────────────────────────┐ │  │
│ │   │ [14:35:12] info  Vite dev server starting...        │ │  │
│ │   │ [14:35:13] info  Ready in 1.2s                      │ │  │
│ │   └─────────────────────────────────────────────────────┘ │  │
│ │                                                           │  │
│ │ ▶ test:watch                         ⚪ Stopped           │  │
│ │                                      [▶️] [⚙️]             │  │
│ │                                                           │  │
│ │ ▶ build:all                          ⚪ Stopped           │  │
│ │                                      [▶️] [⚙️]             │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Proposition 6: Dashboard style avec status cards

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: my-project (active) [development]                    │
│ View Mode: [📋 Tasks] [▶️ Scripts]                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Scripts Dashboard:                                               │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Overview: 2 running / 4 configured  [Configure Scripts]   │  │
│ │                                                           │  │
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│ │ │ dev:    │ │ dev:    │ │ test:   │ │ build:  │        │  │
│ │ │ backend │ │ frontend│ │ watch   │ │ all     │        │  │
│ │ │         │ │         │ │         │ │         │        │  │
│ │ │ 🔴 Run  │ │ 🔴 Run  │ │ ⚪ Stop │ │ ⚪ Stop │        │  │
│ │ │ :3000   │ │ :5173   │ │         │ │         │        │  │
│ │ │ [View]  │ │ [View]  │ │ [Start] │ │ [Start] │        │  │
│ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│ │                                                           │  │
│ │ Selected Log View:                                        │  │
│ │ [dev:backend ▼]                    [⏹️] [♻️] [↗️ Expand] │  │
│ │ ┌─────────────────────────────────────────────────────┐  │  │
│ │ │ [14:32:45] info  Server started on port 3000        │  │  │
│ │ │ [14:32:46] info  Database connected                 │  │  │
│ │ │ [14:32:47] debug Loading middleware...              │  │  │
│ │ │ [14:32:48] info  Ready to accept connections        │  │  │
│ │ │                                                      │  │  │
│ │ └─────────────────────────────────────────────────────┘  │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Design Choisi: Proposition 3 (Multi-panel)

**Choix validé par l'utilisateur**: Multi-panel avec sélecteur dropdown

**Avantages**:

- Vue dynamique avec ajout/suppression de panels à la volée
- Possibilité d'afficher plusieurs logs simultanément
- Layout flexible (Full Width, Split, Grid)
- Plus adapté au workflow de développement multi-composants

**Features implémentées**:

1. **Layout Modes**:
    - Full Width: Un seul panel occupant toute la largeur
    - Split (Side by Side): Deux panels côte à côte
    - Grid 2x2: Quatre panels en grille
2. **Panel Management**:
    - Dropdown pour sélectionner le script par panel
    - Boutons: [⏹️ Stop] [♻️ Restart] [⚙️ Settings] [✖️ Remove Panel]
    - [+ Add Panel] pour ajouter de nouveaux panels dynamiquement
3. **Quick Actions Bar**:
    - Active Scripts count (X running, Y configured)
    - "Stop All" button
    - Layout selector dropdown
4. **Status Indicators**:
    - 🔴 Running
    - 🟢 Stopped (ready)
    - 🟡 Starting
    - 🔵 Stopping
    - ⚠️ Crashed (with restart button)
5. **Keyboard Shortcuts**:
    - `Ctrl+Shift+R`: Restart selected script
    - `Ctrl+Shift+S`: Stop all scripts
    - `Ctrl+Shift+P`: Add new panel

## Architecture Proposée

### Phase 1: Modèle de données et Backend

#### Nouveau modèle: WorkspaceScript

```typescript
{
  id: string;
  workspaceId: string;
  scriptName: string;          // ex: "dev:backend"
  enabled: boolean;
  displayName?: string;         // custom display name
  description?: string;
  url?: string;                 // ex: "http://localhost:3000"
  order: number;
  autoStart: boolean;           // Auto-start on workspace open (Phase 2)
  restartOnFailure: boolean;    // Auto-restart crashed scripts (Phase 2)
  createdAt: string;
  updatedAt: string;
  version: number;              // Optimistic locking (consistent with Task model)
}
```

#### Nouveau modèle: ScriptProcess

```typescript
{
  id: string;
  workspaceScriptId: string;
  pid?: number;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'crashed';
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
  error?: string;
  restartCount: number;         // Track restart attempts (Phase 2)
  lastHeartbeat?: string;       // Process health check (Phase 2)
}
```

#### Nouvelles API Routes (workspaceScripts.contract.ts)

```typescript
POST   /api/workspaces/:workspaceId/scripts              - Create script config
GET    /api/workspaces/:workspaceId/scripts              - List scripts
GET    /api/workspaces/:workspaceId/scripts/available    - Discover available scripts from package.json (NEW)
PATCH  /api/workspaces/:workspaceId/scripts/:id          - Update script config (with version for optimistic locking)
DELETE /api/workspaces/:workspaceId/scripts/:id          - Delete script config

POST   /api/workspaces/:workspaceId/scripts/:id/start    - Start process
POST   /api/workspaces/:workspaceId/scripts/:id/stop     - Stop process
POST   /api/workspaces/:workspaceId/scripts/:id/restart  - Restart process
GET    /api/workspaces/:workspaceId/scripts/:id/logs     - Get logs (paginated, similar to task logs)
GET    /api/workspaces/:workspaceId/scripts/:id/status   - Get process status
DELETE /api/workspaces/:workspaceId/scripts/:id/logs     - Clear logs (Phase 2)
GET    /api/workspaces/:workspaceId/scripts/:id/health   - Health check endpoint (Phase 2)
```

#### Nouveaux services Backend

- `WorkspaceScriptsService.ts` - CRUD for script configs
- `ScriptProcessManager.ts` - **NEW CLASS** wrapping child_process.spawn() with cross-platform support
- `ScriptProcessService.ts` - Process lifecycle management using ScriptProcessManager
- `ScriptLogsStorage.ts` - **EXTENDS TraceChunkStorage** with same 500-entry chunks pattern

### Phase 2: Frontend Components

#### Nouveaux composants

```
packages/web-frontend/src/app/pages/workspaces/
├── scripts/
│   ├── ConfigureScriptsDialog.tsx           - Dialog to configure scripts (with auto-discovery)
│   ├── ScriptsPanel.tsx                     - Main container with layout management
│   ├── ScriptPanel.tsx                      - Single panel component (dropdown + controls + logs)
│   ├── LayoutSelector.tsx                   - Dropdown to select layout (Full/Split/Grid)
│   ├── ScriptSelector.tsx                   - Dropdown to select script for a panel
│   ├── ScriptLogsViewer.tsx                 - Logs viewer per panel (adapt from TaskLogsViewer)
│   ├── ScriptLogEntry.tsx                   - Single log entry (reuse LogEntry component)
│   ├── QuickActionsBar.tsx                  - Top bar with counts and "Stop All" button
│   ├── useWorkspaceScripts.ts               - Hook to fetch/manage scripts
│   ├── useScriptProcess.ts                  - Hook to control process (start/stop/restart)
│   ├── useScriptLogs.ts                     - Hook to stream logs (adapt from useTaskLogs)
│   ├── usePanelLayout.ts                    - Hook to manage panel layout state
│   └── workspaceScripts.api.ts              - API client
```

#### Modifications des composants existants

- `WorkspacePanel.tsx` - Add view mode toggle (Tasks / Scripts)
- `WorkspacesTable.tsx` - Add "Configure Scripts" action in dropdown
- `EditWorkspaceDialog.tsx` - (Optional) Add quick script config section

### Phase 3: Process Management Backend

#### Approche technique validée

1. **Spawning processes**:
    - Réutiliser `ScriptExecutor` (packages/flow-engine/src/executor/ScriptExecutor.ts)
    - Déjà gère Windows (création de fichiers .bat) et Unix
    - Support du streaming de logs en temps réel
    - Commande: `npm run ${scriptName}` depuis le workspace path

2. **Process tracking**:
    - `ScriptProcessManager` class maintient `Map<scriptId, ChildProcess>`
    - Store PIDs dans database (ScriptProcess table)
    - Interface:
        ```typescript
        class ScriptProcessManager {
        	async startScript(scriptId: string, config: ScriptConfig): Promise<void>;
        	async stopScript(scriptId: string, signal?: NodeJS.Signals): Promise<void>;
        	async restartScript(scriptId: string): Promise<void>;
        	getProcessStatus(scriptId: string): ProcessStatus;
        	isRunning(scriptId: string): boolean;
        	async cleanupAllProcesses(): Promise<void>; // Shutdown hook
        }
        ```

3. **Log storage**:
    - `ScriptLogsStorage extends TraceChunkStorage`
    - Base path: `./data/workspace-scripts/{scriptId}/logs/`
    - 500-entry chunks (même pattern que task logs)
    - Pagination support pour l'API
    - Réutilisation de LogEntry interface

4. **Package.json parsing**:
    - Backend-side dans `WorkspaceScriptsService.discoverAvailableScripts()`
    - Read package.json depuis workspace.path
    - Parse scripts section
    - Return script names with metadata

5. **Cleanup sur backend restart**:
    - **On startup**: Query all ScriptProcess with status='running'
    - Check if PIDs still exist (cross-platform: `process.kill(pid, 0)` Unix, `tasklist` Windows)
    - Kill orphans or mark as 'crashed'
    - **On shutdown**: Graceful cleanup hook
        ```typescript
        process.on('SIGTERM', async () => {
        	await scriptProcessManager.cleanupAllProcesses();
        	await server.close();
        });
        ```

6. **Process monitoring** (Phase 2):
    - Heartbeat checks every 30s to detect crashes
    - Auto-restart si restartOnFailure=true

#### Events B2F à ajouter

```typescript
B2F_WORKSPACE_SCRIPT_CREATED;
B2F_WORKSPACE_SCRIPT_UPDATED;
B2F_WORKSPACE_SCRIPT_DELETED;
B2F_SCRIPT_PROCESS_STARTED;
B2F_SCRIPT_PROCESS_STOPPED;
B2F_SCRIPT_PROCESS_LOG_UPDATED; // Similar to B2F_TASK_TRACE_UPDATED
B2F_SCRIPT_PROCESS_ERROR;
```

### Phase 4: UI/UX Details

#### ViewMode Toggle

```typescript
type ViewMode = 'tasks' | 'scripts';
```

- Toggle button in WorkspacePanel below metadata card
- Persisted in localStorage per workspace

#### Script Configuration Dialog

- Modal dialog with form to add/edit scripts
- Script selector from package.json (parsed from workspace path)
- Fields: displayName, description, url, enabled
- Drag-and-drop reordering

#### Panel Layout State Management

**usePanelLayout hook** gère l'état des panels:

```typescript
type LayoutMode = 'full' | 'split' | 'grid';

interface PanelState {
	id: string;
	scriptId: string | null; // null = empty panel
}

interface PanelLayoutState {
	mode: LayoutMode;
	panels: PanelState[]; // 1 panel (full), 2 panels (split), 4 panels (grid)
}
```

**Persistence**: localStorage per workspace
**Key**: `workspace-${workspaceId}-panel-layout`

**Actions**:

- `setLayoutMode(mode)` - Change layout (réorganise les panels)
- `addPanel()` - Ajoute un nouveau panel (max selon layout)
- `removePanel(panelId)` - Supprime un panel
- `setScriptForPanel(panelId, scriptId)` - Assigne un script à un panel

#### Log Viewer Features per Panel

- Real-time streaming via SSE (independent per panel)
- Auto-scroll (toggle per panel)
- Search/filter by text (per panel)
- Level filter (stdout/stderr/info/error) per panel
- Export logs (per panel)
- Clear logs button (per panel)

## Fichiers Critiques

### Fichiers de référence (à lire/réutiliser)

- `packages/orchestrator/src/core/TraceChunkStorage.ts` - Pattern pour ScriptLogsStorage (500-entry chunks, pagination)
- `packages/flow-engine/src/executor/ScriptExecutor.ts` - Réutiliser pour process spawning (Windows .bat handling)
- `packages/web-backend/src/services/TasksService.ts` - Pattern service avec events et repository
- `packages/web-frontend/src/app/pages/tasks/components/TaskLogsViewer.tsx` - UI component pattern pour logs
- `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.ts` - Hook pattern pour log streaming

### Fichiers à créer (Backend)

- `packages/shared-frontend-backend/src/api/workspaceScripts.contract.ts` (NEW)
- `packages/web-backend/src/controllers/WorkspaceScriptsController.ts` (NEW)
- `packages/web-backend/src/services/WorkspaceScriptsService.ts` (NEW)
- `packages/web-backend/src/services/ScriptProcessManager.ts` (NEW - wrapper autour de ScriptExecutor)
- `packages/web-backend/src/services/ScriptProcessService.ts` (NEW)
- `packages/web-backend/src/repositories/WorkspaceScriptsRepository.ts` (NEW)
- `packages/web-backend/src/storage/ScriptLogsStorage.ts` (NEW - extends TraceChunkStorage)

### Fichiers à modifier (Backend)

- `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts` (UPDATE - add script events)
- `packages/shared-frontend-backend/src/transport/EventFilters.ts` (UPDATE - add script filters)
- `packages/web-backend/src/server.ts` (UPDATE - register routes, cleanup hook)

### Fichiers à créer (Frontend)

- `packages/web-frontend/src/app/pages/workspaces/scripts/` (NEW directory)
    - `ConfigureScriptsDialog.tsx` - Configuration dialog avec auto-discovery
    - `ScriptsPanel.tsx` - Main container avec layout management
    - `ScriptPanel.tsx` - Single panel component
    - `LayoutSelector.tsx` - Layout dropdown (Full/Split/Grid)
    - `ScriptSelector.tsx` - Script dropdown per panel
    - `ScriptLogsViewer.tsx` - Logs viewer (adapt from TaskLogsViewer)
    - `ScriptLogEntry.tsx` - Log entry (reuse LogEntry)
    - `QuickActionsBar.tsx` - Top bar avec counts et "Stop All"
    - `useWorkspaceScripts.ts` - Scripts CRUD hook
    - `useScriptProcess.ts` - Process control hook
    - `useScriptLogs.ts` - Log streaming hook (adapt from useTaskLogs)
    - `usePanelLayout.ts` - Panel layout state management
    - `workspaceScripts.api.ts` - API client

### Fichiers à modifier (Frontend)

- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx` (UPDATE - add view mode toggle)
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.tsx` (UPDATE - add action)

## Plan de Vérification

1. **Backend API tests**:
    - Créer des tests unitaires pour WorkspaceScriptsService
    - Créer des tests unitaires pour ScriptProcessService
    - Tester le spawning et le killing de processus

2. **Frontend components tests**:
    - Storybook stories pour ScriptsPanel
    - Storybook stories pour ConfigureScriptsDialog
    - Tests Vitest pour les hooks

3. **Integration tests**:
    - E2E test: configurer un script
    - E2E test: démarrer/arrêter un script
    - E2E test: visualiser les logs en temps réel

4. **Manual testing**:
    - Naviguer vers ProjectsV2 page
    - Sélectionner un workspace
    - Basculer vers "Scripts" view
    - Configurer des scripts (dev:backend, dev:frontend)
    - Démarrer les scripts et vérifier les logs
    - Arrêter les scripts
    - Vérifier que les processus sont bien nettoyés

## Décisions Architecturales

### Questions Résolues

1. **Persistence des logs**:
    - **Décision**: Même durée que les task logs
    - Stockage dans ./data/workspace-scripts/{scriptId}/logs/
    - Cleanup automatique après X jours (configurable)

2. **Limites de processus**:
    - **Décision**: Max 5 scripts configurés par workspace (MVP)
    - Phase 2: Augmenter à 10 si nécessaire
    - Validation côté backend avant création

3. **Sécurité**:
    - **Décision**: Only allow scripts from package.json
    - Backend parse le package.json du workspace
    - Pas d'exécution de commandes arbitraires
    - Phase 2: Whitelist/blacklist additionnelle si nécessaire

4. **Multi-instance**:
    - **Décision**: Document limitation (single backend instance)
    - Current architecture n'a pas de load balancing
    - Phase 3: Si besoin, ajouter file-based locks dans workspace directory

5. **Cross-platform compatibility**:
    - **Décision**: Réutiliser ScriptExecutor (déjà gère Windows/Unix)
    - Process killing: taskkill (Windows) vs kill (Unix)
    - Path handling: path.join() et normalize separators

### Scope d'implémentation

**Choix validé par l'utilisateur**: Scope complet (toutes fonctionnalités)

**Fonctionnalités incluses**:

- ✅ Start/stop/restart controls
- ✅ Multi-panel log viewing avec layouts flexibles (Full Width / Split / Grid)
- ✅ Script auto-discovery from package.json
- ✅ Panel management dynamique (add/remove panels)
- ✅ Real-time log streaming via SSE
- ✅ Status indicators (running/stopped/starting/stopping/error/crashed)
- ✅ Auto-restart on crash (configurable)
- ✅ Auto-start on workspace open (configurable)
- ✅ URL health checks (optional per script)
- ✅ Log export functionality
- ✅ Process cleanup on backend shutdown
- ✅ Process heartbeat monitoring
- ✅ Keyboard shortcuts
- ✅ Max 10 scripts per workspace (limite haute)
- ✅ Search/filter dans les logs
- ✅ Auto-scroll toggle per panel

### Ordre d'implémentation recommandé

**Étape 1: Infrastructure Backend**

1. Data models (WorkspaceScript, ScriptProcess) + migrations
2. ScriptLogsStorage (extends TraceChunkStorage)
3. ScriptProcessManager (wrapper autour de ScriptExecutor)
4. WorkspaceScriptsRepository
5. API contract (workspaceScripts.contract.ts)

**Étape 2: Services Backend**

1. WorkspaceScriptsService (CRUD + auto-discovery)
2. ScriptProcessService (lifecycle management)
3. WorkspaceScriptsController (routes)
4. B2F events + filters
5. Server integration (routes, cleanup hook)

**Étape 3: Frontend Core**

1. API client (workspaceScripts.api.ts)
2. Hooks (useWorkspaceScripts, useScriptProcess, useScriptLogs)
3. WorkspacePanel view mode toggle
4. ConfigureScriptsDialog avec auto-discovery

**Étape 4: Frontend Multi-Panel UI**

1. ScriptsPanel (container avec layout management)
2. ScriptPanel (single panel component)
3. ScriptLogsViewer (adapt from TaskLogsViewer)
4. Panel controls (dropdown, buttons)
5. Layout selector et panel add/remove

**Étape 5: Features Avancées**

1. Auto-restart logic
2. Auto-start logic
3. Health checks
4. Log export
5. Keyboard shortcuts
6. Process monitoring

**Étape 6: Tests & Polish**

1. Backend unit tests
2. Frontend component tests
3. E2E tests
4. Performance optimization
5. Documentation
