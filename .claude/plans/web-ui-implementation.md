# Web UI Implementation Plan

## Status: In Progress (Phase 1 Complete)

## Overview
Implementation of the web-based UI for the Agent Fleet orchestrator, including Dashboard, Workers, Tasks, and Workspaces management pages.

---

## ✅ Phase 1: Core Pages Implementation (COMPLETED)

### 1.1 Dashboard Page ✅
**Status**: Complete
**Files Created**:
- `packages/web-frontend/src/app/pages/dashboard/DashboardPage.tsx`
- `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts`
- `packages/web-frontend/src/app/pages/dashboard/DashboardService.ts`
- `packages/web-frontend/src/app/pages/dashboard/dashboard.api.ts`
- `packages/web-backend/src/controllers/DashboardController.ts`
- `packages/web-backend/src/services/DashboardService.ts`
- `packages/shared-frontend-backend/src/api/dashboard.contract.ts`

**Features**:
- Real-time orchestrator status and metrics
- Worker statistics (connected, idle, busy)
- Task distribution visualization
- Throughput metrics (tasks/hour, success rate)
- Recent activity feed
- Quick actions navigation
- Auto-refresh every 5 seconds

---

### 1.2 Workers Page ✅
**Status**: Complete
**Files Created**:
- `packages/web-frontend/src/app/pages/workers/WorkersPage.tsx`
- `packages/web-frontend/src/app/pages/workers/WorkersTable.tsx`
- `packages/web-frontend/src/app/pages/workers/useWorkers.ts`
- `packages/web-frontend/src/app/pages/workers/WorkersService.ts`
- `packages/web-frontend/src/app/pages/workers/workers.api.ts`
- `packages/web-backend/src/controllers/WorkersController.ts`
- `packages/web-backend/src/services/WorkersService.ts`
- `packages/shared-frontend-backend/src/api/workers.contract.ts`

**Features**:
- Workers list with connection status
- State indicators (idle, busy, disconnected)
- Connection time tracking
- Active tasks count per worker
- Auto-refresh every 5 seconds
- Responsive table layout

---

### 1.3 Tasks Page ✅
**Status**: Complete
**Files Created**:
- `packages/web-frontend/src/app/pages/tasks/TasksPage.tsx`
- `packages/web-frontend/src/app/pages/tasks/TasksTable.tsx`
- `packages/web-frontend/src/app/pages/tasks/TaskFilters.tsx`
- `packages/web-frontend/src/app/pages/tasks/useTasks.ts`
- `packages/web-frontend/src/app/pages/tasks/TasksService.ts`
- `packages/web-frontend/src/app/pages/tasks/tasks.api.ts`
- `packages/web-backend/src/controllers/TasksController.ts`
- `packages/web-backend/src/services/TasksService.ts`
- `packages/shared-frontend-backend/src/api/tasks.contract.ts`

**Features**:
- Tasks list with status badges
- Filtering by status, priority, and worker
- Summary statistics
- Worker assignment display
- Flow result indicators
- Auto-refresh every 5 seconds
- Responsive layout

---

### 1.4 Workspaces Page ✅
**Status**: Complete
**Files Created**:
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesPage.tsx`
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.tsx`
- `packages/web-frontend/src/app/pages/workspaces/useWorkspaces.ts`
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesService.ts`
- `packages/web-frontend/src/app/pages/workspaces/workspaces.api.ts`
- `packages/web-backend/src/controllers/WorkspacesController.ts`
- `packages/web-backend/src/services/WorkspacesService.ts` (MVP with mock data)
- `packages/shared-frontend-backend/src/api/workspaces.contract.ts`

**Features**:
- Workspaces list with status indicators
- Summary cards (Total, Active, Locked, Cleaning, Errors)
- Git status display (ahead, behind, modified, untracked)
- Active tasks count
- Path and mode information
- Auto-refresh every 5 seconds

---

## 🐛 Bugs Fixed

### 1. TypeScript Compilation Issues ✅
**Problem**: workspaces.contract.ts not being compiled
**Solution**:
- Changed tsconfig.json to compile to `src/` instead of `dist/`
- Updated package.json main/types to point to `src/index.js`
- All contract files now compile correctly in-place

### 2. Service Mapping Missing ✅
**Problem**: `No service mapping found for baseUrl: /api/workspaces`
**Solution**: Added WorkspacesService mapping in `lazy-controller-plugin.ts` (lines 151-152)

### 3. Navigation Menu Missing ✅
**Problem**: Workspaces link not showing in sidebar
**Solution**:
- Added Workspaces to `DesktopSidebar.tsx` (lines 4, 28-32)
- Added Workspaces to `MobileSidebar.tsx` (lines 9, 33-37)
- Removed unused `Sidebar.tsx` file to avoid confusion

### 4. Polling Interval Bug ✅
**Problem**: Requests firing every 300-500ms instead of 5000ms
**Root Cause**: `useAbortableEffect` re-creating intervals when `fetchTasks/Workers/Workspaces` changed
**Solution**: Separated initial fetch from polling in 3 hooks:
- `useTasks.ts` - Split into 2 effects (lines 78-100)
- `useWorkers.ts` - Split into 2 effects (lines 73-95)
- `useWorkspaces.ts` - Split into 2 effects (lines 73-95)

**Result**: Now correctly polls at 5-second intervals

---

## 📋 Architecture Summary

### Backend Pattern (Controller → Service → Repository)
```
┌─────────────────┐
│   Controller    │ ← HTTP layer, Zod validation
└────────┬────────┘
         │
┌────────▼────────┐
│    Service      │ ← Business logic
└────────┬────────┘
         │
┌────────▼────────┐
│   Repository    │ ← Data access (orchestrator API)
└─────────────────┘
```

### Frontend Pattern (Page → Hook → Service → API)
```
┌─────────────────┐
│      Page       │ ← UI components
└────────┬────────┘
         │
┌────────▼────────┐
│      Hook       │ ← State management, polling
└────────┬────────┘
         │
┌────────▼────────┐
│    Service      │ ← Business logic
└────────┬────────┘
         │
┌────────▼────────┐
│   API Client    │ ← Type-safe fetch with contracts
└─────────────────┘
```

### Key Files
- **Routes**: `packages/web-backend/src/routes.ts`
- **Service Mapping**: `packages/web-backend/src/utils/lazy-controller-plugin.ts`
- **Factory**: `packages/web-backend/src/factories/DataStoreFactory.ts`
- **Exports**: `packages/shared-frontend-backend/src/index.ts`
- **Routes Registry**: `packages/shared-frontend-backend/src/types.ts`

---

## 🔄 Phase 2: Real-time Updates (IN PROGRESS)

### 2.1 WebSocket Integration
**Status**: In Progress
**Goal**: Replace polling with WebSocket for real-time updates

**Architecture**:
```
StateManager → UIClientHook → UIWebSocketServer → UI Clients (browsers)
                                     ↓
                            ws://localhost:3737/ws/ui
```

**Backend Tasks**:
- [x] Created `UIWebSocketServer` class (packages/orchestrator/src/websocket/UIWebSocketServer.ts)
  - Listens to UIClientHook events
  - Broadcasts state_update, command_result, error, snapshot to all UI clients
  - Manages client connections and disconnections
- [~] Integrate UIWebSocketServer with RestAPI
  - [x] Added imports and constructor parameter
  - [ ] Complete setupUIWebSocket() method
  - [ ] Add WebSocket upgrade endpoint on Express server
- [ ] Update Orchestrator to pass UIClientHook to RestAPI constructor
- [ ] Enable UIClientHook by default (not just with env var)

**Frontend Tasks**:
- [ ] Create WebSocket client hook (`useOrchestratorWebSocket`)
  - Connect to ws://localhost:3737/ws/ui
  - Handle reconnection logic
  - Emit events for state updates
- [ ] Integrate WebSocket into Dashboard page
  - Replace polling with WebSocket updates
  - Keep polling as fallback
- [ ] Integrate WebSocket into Workers page
- [ ] Integrate WebSocket into Tasks page
- [ ] Integrate WebSocket into Workspaces page
- [ ] Add connection status indicator (connected/disconnected/reconnecting)

**Event Types**:
- `state_update` - Task/worker/metric changes
- `command_result` - Response to UI commands
- `error` - Error notifications
- `snapshot` - Full state on connection
- `connected` - Welcome message on connect

**Benefits**:
- Reduced server load (no polling)
- Instant updates on changes
- Better user experience

**Files Created/Modified**:
- `packages/orchestrator/src/websocket/UIWebSocketServer.ts` (NEW)
- `packages/orchestrator/src/core/RestAPI.ts` (MODIFIED - partial)
- `packages/orchestrator/src/core/index.ts` (TODO - pass UIClientHook)

**Next Steps**:
1. Complete RestAPI setupUIWebSocket() method
2. Add WebSocket upgrade endpoint to Express
3. Update Orchestrator to wire everything together
4. Create frontend WebSocket hook
5. Integrate into all pages with fallback to polling

---

## 🎯 Phase 3: Quick Actions (TODO)

### 3.1 Dashboard Quick Actions
**Status**: Pending
**Goal**: Implement handlers for quick action buttons

**Tasks**:
- [ ] "View All Workers" → Navigate to /workers
- [ ] "View All Tasks" → Navigate to /tasks
- [ ] "Create Task" → Modal/form for task creation
- [ ] "Manage Workspaces" → Navigate to /workspaces
- [ ] Add navigation handlers in QuickActions component

---

## 📦 Phase 4: Enhancements (FUTURE)

### 4.1 Task Details Modal
- Detailed task view with full metadata
- Flow execution logs
- Retry/cancel actions

### 4.2 Worker Management
- Manual worker registration
- Worker health checks
- Performance metrics

### 4.3 Workspace Management
- Create/delete workspaces
- Git operations (pull, push, checkout)
- Cleanup operations
- Environment configuration

### 4.4 Search & Filtering
- Global search across entities
- Advanced filtering options
- Sort and column customization

### 4.5 Charts & Analytics
- Task completion trends
- Worker utilization graphs
- System performance metrics
- Historical data visualization

---

## 🏗️ Technical Debt & Improvements

### TypeScript Configuration
- **Issue**: Project uses mixed compilation targets (some to dist/, some to src/)
- **Recommendation**: Standardize to compile to dist/ and update all imports
- **Risk**: Low (current setup works but confusing)

### Mock Data
- **Current**: WorkspacesService generates mock data (MVP)
- **TODO**: Connect to real orchestrator workspace API
- **Files**: `packages/web-backend/src/services/WorkspacesService.ts`

### Polling Strategy
- **Current**: Each page polls independently every 5 seconds
- **Future**: Migrate to WebSocket for push-based updates
- **Benefit**: Reduced server load, instant updates

---

## 📝 Notes

### Build Commands
- **Backend**: `cd packages/web-backend && npm run build`
- **Frontend**: `cd packages/web-frontend && npm run build`
- **Shared**: `cd packages/shared-frontend-backend && npm run build`

### Dev Servers
- **Backend**: Port 3030 (http://localhost:3030/api)
- **Frontend**: Port 5030 (http://localhost:5030)
- **Orchestrator**: Port 3737 (http://localhost:3737)

### Testing
- Backend endpoints accessible at `/api/{endpoint}`
- All pages support auto-refresh
- Manual refresh buttons available
- Responsive design tested on desktop and mobile

---

## ✅ Completion Checklist

### Phase 1 ✅
- [x] Dashboard page with metrics
- [x] Workers page with status
- [x] Tasks page with filtering
- [x] Workspaces page with git info
- [x] Navigation integration
- [x] Auto-refresh (5s intervals)
- [x] Error handling
- [x] Loading states
- [x] Responsive layout
- [x] Fix polling bug
- [x] Fix service mapping
- [x] Fix navigation menu

### Phase 2 ⏳ (IN PROGRESS)
- [x] Design WebSocket architecture
- [x] Create UIWebSocketServer class
- [~] WebSocket server setup in orchestrator
  - [x] UIWebSocketServer implementation
  - [x] RestAPI integration (partial)
  - [ ] Complete setupUIWebSocket() method
  - [ ] WebSocket upgrade endpoint
  - [ ] Wire UIClientHook to RestAPI
- [ ] WebSocket client integration in frontend
- [ ] Event-based updates for all pages
- [ ] Connection status indicator
- [ ] Reconnection logic
- [ ] Fallback to polling

### Phase 3 ⏳
- [ ] Quick action handlers
- [ ] Task creation modal
- [ ] Navigation flows

---

**Last Updated**: 2025-12-21 (Phase 2 WebSocket started)
**Next Steps**:
1. Complete WebSocket server setup in orchestrator (setupUIWebSocket, upgrade endpoint)
2. Wire UIClientHook to RestAPI in Orchestrator constructor
3. Create frontend WebSocket client hook
4. Integrate WebSocket into all pages with polling fallback
