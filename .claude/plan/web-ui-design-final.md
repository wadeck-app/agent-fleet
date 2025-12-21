# UI Design - Final Selections for Agent Fleet Web Application

## Overview

This document presents the final selected ASCII mockups for the web interface to manage the Agent Fleet orchestrator system.

---

## 1. DASHBOARD / ORCHESTRATOR OVERVIEW

**Selected: Metrics-Focused Dashboard**

```
╔════════════════════════════════════════════════════════════════════════════════╗
║ AGENT FLEET ORCHESTRATOR                                 [Connected] ↻ 00:23:45 ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  STATUS                           WORKERS                    TASKS             ║
║  ┌──────────────────────────┐    ┌──────────────────┐    ┌─────────────────┐ ║
║  │ ● Running                │    │ Connected: 12/15 │    │ Total:       47 │ ║
║  │ Uptime: 1d 5h 23m        │    │ ⚙ Busy:      8   │    │ ⏵ Active:    12 │ ║
║  │ Version: 1.0.0           │    │ ○ Idle:      4   │    │ ⏸ Review:     3 │ ║
║  │                          │    │ ⊗ Offline:   3   │    │ ✓ Done:      28 │ ║
║  └──────────────────────────┘    └──────────────────┘    │ ⊘ Blocked:    2 │ ║
║                                                            │ ✗ Failed:     2 │ ║
║  THROUGHPUT                                                └─────────────────┘ ║
║  ┌────────────────────────────────────────────────────────────────────────────┐║
║  │ Last Hour:  [████████░░░░░░░] 8 tasks/hour (avg: 12.5)                    │║
║  │ Success Rate: 92% (23/25 completed)                                        │║
║  │ Avg Task Duration: 3m 42s                                                  │║
║  └────────────────────────────────────────────────────────────────────────────┘║
║                                                                                ║
║  RECENT ACTIVITY                                               [View All →]   ║
║  ┌────────────────────────────────────────────────────────────────────────────┐║
║  │ 23:42  ✓  task-892  Completed flow execution (dev-worker-3)               │║
║  │ 23:41  ⚙  task-891  Started "Deploy to staging" (dev-worker-5)            │║
║  │ 23:40  ⏸  task-890  Awaiting review: Code changes (reviewer-worker-1)     │║
║  │ 23:38  ✓  task-889  PR merged successfully (dev-worker-2)                 │║
║  │ 23:35  ⊗  worker-8  Disconnected (timeout)                                │║
║  └────────────────────────────────────────────────────────────────────────────┘║
║                                                                                ║
║  QUICK ACTIONS                                                                 ║
║  [+ New Task]  [⚙ Manage Workers]  [📁 Workspaces]  [⏸ Review Queue (3)]     ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

**Rationale:**

- Clear metrics presentation at the top
- Activity feed for recent events
- Quick action buttons for common operations
- Balances information density with readability

---

## 2. WORKSPACES MANAGEMENT

**Selected: Table with Details Panel**

```
╔════════════════════════════════════════════════════════════════════════════════╗
║ WORKSPACES                                   [+ New]  [Clean Unused]  [Refresh] ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║ Active: 8/20  │  Isolated: 5  │  Shared: 3  │  Manual: 0  │  Disk: 4.2GB      ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ID       │ Path              │ Mode     │ Tasks  │ Git Branch  │ Status   │ ║
║ ├────────────────────────────────────────────────────────────────────────────┤ ║
║ │ ws-001 ● │ /tmp/fleet/ws-001 │ Isolated │ 1      │ feat-auth   │ ⚙ Active │ ║
║ │ ws-003 ● │ /tmp/fleet/ws-003 │ Shared   │ 3      │ main        │ ⚙ Active │ ║
║ │ ws-005 ● │ /tmp/fleet/ws-005 │ Isolated │ 1      │ fix/bug-123 │ ⚙ Active │ ║
║ │ ws-007 ● │ /tmp/fleet/ws-007 │ Shared   │ 2      │ main        │ ⚙ Active │ ║
║ │ ws-009 ● │ /tmp/fleet/ws-009 │ Isolated │ 1      │ main        │ ⚙ Active │ ║
║ │ ws-011 ○ │ /tmp/fleet/ws-011 │ Isolated │ 0      │ main        │ ○ Idle   │ ║
║ │ ws-013 ○ │ /tmp/fleet/ws-013 │ Shared   │ 0      │ develop     │ ○ Idle   │ ║
║ │ ws-015 ○ │ /tmp/fleet/ws-015 │ Isolated │ 0      │ main        │ ○ Idle   │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║   [<] 1-8 of 20 [>]                                   Sort: [Last Used ▼]      ║
║                                                                                ║
║ SELECTED: ws-003 (/tmp/fleet/ws-003)                                          ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ Mode: Shared                     Concurrency Key: project-alpha              │ ║
║ │ Created: 2025-12-17 18:30        Last Used: 2025-12-18 23:41                │ ║
║ │ Usage Count: 127                 Size: 523MB                                 │ ║
║ │                                                                              │ ║
║ │ Git Status:                                                                  │ ║
║ │   Branch: main                   ✓ Clean working directory                  │ ║
║ │   Last Commit: a8ff59d - "feat: Add validation types"                       │ ║
║ │                                                                              │ ║
║ │ Active Tasks (3):                                                            │ ║
║ │   • task-891 (IN_PROGRESS) - Deploy to staging                              │ ║
║ │   • task-865 (IN_PROGRESS) - Update dependencies                            │ ║
║ │   • task-843 (TESTING)     - Integration tests                              │ ║
║ │                                                                              │ ║
║ │ [View Directory] [View Git Log] [Lock] [Force Cleanup]                      │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

**Rationale:**

- Mini table at top shows summary stats
- Split view allows seeing list and details simultaneously
- Git status and active tasks are critical information
- Detailed panel provides all context needed for decisions
- Perfect for limited number of workspaces (10-20)

---

## 3. WORKERS MANAGEMENT

**Selected: Compact Table with Details Panel**

```
╔════════════════════════════════════════════════════════════════════════════════╗
║ WORKERS                           Connected: 12/15 (80%)    [+ Add]  [Refresh] ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║ Connected: 12  │  Busy: 8  │  Idle: 4  │  Offline: 3  │  Avg Load: 67%        ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ID             │ Type    │ Status  │ Current Task    │ Uptime  │ Load     │ ║
║ ├────────────────────────────────────────────────────────────────────────────┤ ║
║ │ pm-worker-1  ● │ PM      │ ⚙ BUSY  │ task-876        │ 1d 5h   │ ████░ 80%│ ║
║ │ pm-worker-2  ● │ PM      │ ○ IDLE  │ —               │ 23h     │ ░░░░░  0%│ ║
║ │ pm-worker-3  ● │ PM      │ ○ IDLE  │ —               │ 18h     │ ░░░░░  0%│ ║
║ │ po-worker-1  ● │ PO      │ ⚙ BUSY  │ task-880        │ 2d      │ ███░░ 60%│ ║
║ │ po-worker-2  ● │ PO      │ ○ IDLE  │ —               │ 1d      │ ░░░░░  0%│ ║
║ │ dev-worker-1 ● │ DEV     │ ⚙ BUSY  │ task-891        │ 3d      │ █████100%│ ║
║ │ dev-worker-2 ● │ DEV     │ ⚙ BUSY  │ task-888        │ 3d      │ ████░ 75%│ ║
║ │ dev-worker-3 ● │ DEV     │ ○ IDLE  │ —               │ 2d      │ ░░░░░  0%│ ║
║ │ dev-worker-4 ● │ DEV     │ ⚙ BUSY  │ task-887        │ 2d      │ ███░░ 65%│ ║
║ │ dev-worker-5 ● │ DEV     │ ⚙ BUSY  │ task-884        │ 1d      │ ██░░░ 40%│ ║
║ │ dev-worker-6 ● │ DEV     │ ○ IDLE  │ —               │ 1d      │ ░░░░░  0%│ ║
║ │ dev-worker-7 ⊗ │ DEV     │ OFFLINE │ (disconnected)  │ —       │ ░░░░░  —│ ║
║ │ dev-worker-8 ● │ DEV     │ ○ IDLE  │ —               │ 12h     │ ░░░░░  0%│ ║
║ │ reviewer-1   ● │ REVIEW  │ ⚙ BUSY  │ task-890        │ 2d      │ ███░░ 55%│ ║
║ │ reviewer-2   ● │ REVIEW  │ ○ IDLE  │ —               │ 1d      │ ░░░░░  0%│ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║   [<] 1-15 of 15 [>]                                Sort: [Type ▼]             ║
║                                                                                ║
║ SELECTED: dev-worker-1                                                         ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ Worker ID: dev-worker-1              Type: Developer (DEV)                  │ ║
║ │ Status: ● Connected (3d ago)         State: ⚙ BUSY (Load: 100%)            │ ║
║ │                                                                             │ ║
║ │ Current Task: task-891 - "Deploy to staging"                               │ ║
║ │   Flow: deploy-flow v1.2.0                                                 │ ║
║ │   Workspace: ws-003 (/tmp/fleet/ws-003)                                    │ ║
║ │   Progress: Step 8/12 (67%)  [████████████████░░░░░░]                      │ ║
║ │   Current Step: Running integration tests                                  │ ║
║ │   Elapsed: 5m 23s                                                          │ ║
║ │                                                                             │ ║
║ │ Performance Today:                                                          │ ║
║ │   • Tasks completed: 12                                                     │ ║
║ │   • Success rate: 100% (12/12)                                              │ ║
║ │   • Average duration: 6m 23s                                                │ ║
║ │   • Total work time: 1h 16m                                                 │ ║
║ │                                                                             │ ║
║ │ Recent History (Last 3):                                                    │ ║
║ │   • 23:42  ✓  task-892 - "Fix login bug" (3m 15s)                          │ ║
║ │   • 23:15  ✓  task-885 - "Update dependencies" (8m 42s)                    │ ║
║ │   • 22:48  ✓  task-878 - "Add validation" (5m 01s)                         │ ║
║ │                                                                             │ ║
║ │ Capabilities:                                                               │ ║
║ │   • Flows available: 15                                                     │ ║
║ │   • Project: agent-fleet                                                    │ ║
║ │   • Concurrent tasks: 1 (max: 1)                                            │ ║
║ │                                                                             │ ║
║ │ Connection:                                                                 │ ║
║ │   • Last heartbeat: 2s ago                                                  │ ║
║ │   • Reconnections: 0                                                        │ ║
║ │   • WebSocket: ws://localhost:3000                                          │ ║
║ │                                                                             │ ║
║ │ [View Full Log] [Pause Worker] [Disconnect] [View Workspace]               │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

**Rationale:**

- Similar to workspaces - consistent UX pattern
- Small table shows all workers with key info at a glance
- Detailed panel on selection shows full worker context
- Performance metrics and activity history easily accessible
- Works well for limited number of workers (10-20)
- Load bars provide quick visual indication of utilization

---

## 4. TASKS REQUIRING USER INPUT (Review Queue)

**Selected: Card-Based Action Queue**

```
╔════════════════════════════════════════════════════════════════════════════════╗
║ 🔔 ACTION REQUIRED                                          5 Tasks Need You    ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  Filter: [All ▼] [Review ▼] [Changes Requested ▼]      Sort: [Urgent First]   ║
║                                                                                ║
║  ┌────────────────────────────────────────────────────────────────────────────┐ ║
║  │ 🔴 URGENT • task-893                                      ⏱ Waiting 8m 15s │ ║
║  ├────────────────────────────────────────────────────────────────────────────┤ ║
║  │ Deployment Approval: Production Release v2.1.0                             │ ║
║  │                                                                            │ ║
║  │ 👤 Assigned: po-worker-1     📁 Workspace: ws-007                          │ ║
║  │ 🎯 Flow: deploy-flow v1.2.0  ⚙ Worker: reviewer-1                          │ ║
║  │                                                                            │ ║
║  │ Summary:                                                                   │ ║
║  │ • All tests passed (124/124) ✓                                             │ ║
║  │ • Build successful ✓                                                       │ ║
║  │ • Ready to deploy to production                                            │ ║
║  │                                                                            │ ║
║  │ [✓ Approve & Deploy] [✗ Reject] [💬 Add Comment] [📊 View Details]        │ ║
║  └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║  ┌────────────────────────────────────────────────────────────────────────────┐ ║
║  │ 🔴 HIGH • task-890                                         ⏱ Waiting 2m 30s│ ║
║  ├────────────────────────────────────────────────────────────────────────────┤ ║
║  │ Code Review: Authentication middleware refactor                            │ ║
║  │                                                                            │ ║
║  │ 👤 Assigned: reviewer-1      📁 Workspace: ws-001                          │ ║
║  │ 🎯 Flow: dev-flow v2.1.0     ⚙ Worker: dev-worker-2                        │ ║
║  │                                                                            │ ║
║  │ Changes:                                                                   │ ║
║  │ • 4 files modified (+402 -43 lines)                                        │ ║
║  │ • src/auth/middleware.ts - Added JWT validation                            │ ║
║  │ • tests/auth.test.ts - Full test coverage added                            │ ║
║  │                                                                            │ ║
║  │ Tests: ✓ All passed (156 tests, +42 new)                                  │ ║
║  │                                                                            │ ║
║  │ [✓ Approve] [✗ Request Changes] [💬 Comment] [📄 View Diff]               │ ║
║  └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║  ┌────────────────────────────────────────────────────────────────────────────┐ ║
║  │ 🟡 MEDIUM • task-895                                      ⏱ Waiting 12m 42s│ ║
║  ├────────────────────────────────────────────────────────────────────────────┤ ║
║  │ Plan Review: User notification system feature                              │ ║
║  │                                                                            │ ║
║  │ 👤 Assigned: pm-worker-2     📁 Workspace: ws-005                          │ ║
║  │ 🎯 Flow: planning-flow v1.0  ⚙ Worker: pm-worker-1                         │ ║
║  │                                                                            │ ║
║  │ Proposed Plan:                                                             │ ║
║  │ 1. Design notification data model                                          │ ║
║  │ 2. Implement WebSocket notification service                                │ ║
║  │ 3. Create React notification components                                    │ ║
║  │ 4. Add notification preferences to user settings                           │ ║
║  │                                                                            │ ║
║  │ Estimated effort: 2-3 days  •  Complexity: Medium                          │ ║
║  │                                                                            │ ║
║  │ [✓ Approve Plan] [✗ Reject] [✏ Request Changes] [📋 View Full Plan]       │ ║
║  └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║  ⚠ CHANGES REQUESTED                                                           ║
║  ┌────────────────────────────────────────────────────────────────────────────┐ ║
║  │ task-871 • Fix test failures                          📅 Requested 1h ago  │ ║
║  │ Reason: "Missing edge case tests for null inputs"                          │ ║
║  │ [View Task] [Check Progress]                                               │ ║
║  └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║  ┌────────────────────────────────────────────────────────────────────────────┐ ║
║  │ task-868 • Refactor database queries                  📅 Requested 3h ago  │ ║
║  │ Reason: "Performance concerns with nested queries"                         │ ║
║  │ [View Task] [Check Progress]                                               │ ║
║  └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

**Rationale:**

- Card format makes each review task prominent
- All critical info visible at card level
- Quick action buttons on each card for immediate action
- Easy to scan multiple pending reviews
- Urgent/high-priority items clearly highlighted with color coding
- Separate section for tasks with requested changes

---

## 5. PLAN REVIEW (GitHub PR-Style)

**Selected: GitHub PR-Style with Inline Comments**

```
╔════════════════════════════════════════════════════════════════════════════════╗
║ 📋 PLAN REVIEW #895: User Notification System           [⏸ Review] 🟡 MEDIUM  ║
╠════════════════════════════════════════════════════════════════════════════════╣
║ pm-worker-2 wants to merge this plan                          Created 12m ago ║
║ Estimated effort: 25 hours (3 days)                      [View Task Details →]║
╠════════════════════════════════════════════════════════════════════════════════╣
║ [💬 Conversation (3)] [📄 Plan Details] [📁 Files (11)] [🔍 Reviews]          ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║ DESCRIPTION                                                                    ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ Implement a real-time notification system that allows users to receive     │ ║
║ │ updates about task completions, worker status changes, and system events.  │ ║
║ │                                                                            │ ║
║ │ **Requirements:**                                                          │ ║
║ │ • WebSocket-based real-time delivery                                       │ ║
║ │ • Persistent notification history                                          │ ║
║ │ • User preferences for notification types                                  │ ║
║ │ • Desktop & in-app notifications                                           │ ║
║ │ • Mark as read/unread functionality                                        │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                                ║
║ IMPLEMENTATION PLAN                                                            ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ## Step 1: Design Notification Data Model                                 │ ║
║ │ **Estimated:** 4 hours                                                     │ ║
║ │ **Dependencies:** None                                                     │ ║
║ │                                                                            │ ║
║ │ ### Tasks                                                                  │ ║
║ │ - [ ] Define notification schema (type, content, metadata, timestamps)    │ ║
║ │ - [ ] Design database tables (notifications, user_preferences)            │ ║
║ │ - [ ] Create TypeScript types and interfaces                              │ ║
║ │                                                                            │ ║
║ │ ### Deliverables                                                           │ ║
║ │ - `src/shared/types/Notification.ts`                                       │ ║
║ │ - `migrations/007_notifications.sql`                                       │ ║
║ │ - API endpoint specifications (Swagger/OpenAPI)                            │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║   💬 pm-worker-1 12m ago                                         [💭 + Reply] ║
║   ┌──────────────────────────────────────────────────────────────────────────┐ ║
║   │ Consider adding notification templates for consistent messaging.         │ ║
║   │ Should we include support for email notifications as well?               │ ║
║   └──────────────────────────────────────────────────────────────────────────┘ ║
║      └─ 💬 pm-worker-2 8m ago                                                 ║
║         ┌────────────────────────────────────────────────────────────────────┐ ║
║         │ Good point on templates! I'll add that to Step 1.                  │ ║
║         │ Email can be a Phase 2 feature - let's focus on WebSocket first.  │ ║
║         └────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ## Step 2: Implement WebSocket Notification Service                       │ ║
║ │ **Estimated:** 8 hours                                                     │ ║
║ │ **Dependencies:** Step 1                                                   │ ║
║ │                                                                            │ ║
║ │ ### Tasks                                                                  │ ║
║ │ - [ ] Create NotificationService class in orchestrator                    │ ║
║ │ - [ ] Integrate with existing StateManager events                         │ ║
║ │ - [ ] Implement WebSocket broadcast to subscribed clients                 │ ║
║ │ - [ ] Add persistence layer (save to database)                            │ ║
║ │ - [ ] Implement notification filtering by user preferences                │ ║
║ │                                                                            │ ║
║ │ ### Deliverables                                                           │ ║
║ │ - `src/orchestrator/notifications/NotificationService.ts`                  │ ║
║ │ - `src/orchestrator/notifications/NotificationRepository.ts`               │ ║
║ │ - Unit tests (>70% coverage)                                               │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║   💬 tech-lead 5m ago  ⚠ Request Changes                         [💭 + Reply] ║
║   ┌──────────────────────────────────────────────────────────────────────────┐ ║
║   │ We should reuse the existing `UIClientHook` pattern instead of creating │ ║
║   │ a separate WebSocket connection. Can we extend that architecture?       │ ║
║   │                                                                          │ ║
║   │ Also, 8 hours seems optimistic. This touches critical path code.        │ ║
║   │ Suggest bumping to 12 hours to account for testing & integration.       │ ║
║   └──────────────────────────────────────────────────────────────────────────┘ ║
║      [+ Add suggestion] [Mark as resolved] [Start a review]                   ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ## Step 3: Create React Notification Components                           │ ║
║ │ **Estimated:** 6 hours                                                     │ ║
║ │ **Dependencies:** Step 2                                                   │ ║
║ │                                                                            │ ║
║ │ ### Tasks                                                                  │ ║
║ │ - [ ] Build NotificationCenter component                                  │ ║
║ │ - [ ] Build NotificationToast component                                   │ ║
║ │ - [ ] Create useNotifications custom hook                                 │ ║
║ │ - [ ] Add notification badge to header                                    │ ║
║ │ - [ ] Implement mark as read/unread functionality                         │ ║
║ │                                                                            │ ║
║ │ ### Deliverables                                                           │ ║
║ │ - `src/web-ui/components/NotificationCenter.tsx`                           │ ║
║ │ - `src/web-ui/components/NotificationToast.tsx`                            │ ║
║ │ - `src/web-ui/hooks/useNotifications.ts`                                   │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ## Step 4: Add Notification Preferences                                   │ ║
║ │ **Estimated:** 4 hours                                                     │ ║
║ │ **Dependencies:** Step 2, Step 3                                           │ ║
║ │                                                                            │ ║
║ │ ### Tasks                                                                  │ ║
║ │ - [ ] Create notification preferences UI in settings                      │ ║
║ │ - [ ] Implement preferences API endpoints                                 │ ║
║ │ - [ ] Add preference validation                                           │ ║
║ │ - [ ] Create default preferences on user creation                         │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║   💬 ux-designer 3m ago  ✅ Approved                             [💭 + Reply] ║
║   ┌──────────────────────────────────────────────────────────────────────────┐ ║
║   │ UI mockups look good! Make sure we follow the existing design system    │ ║
║   │ tokens for colors and spacing. I'll review the components when ready.   │ ║
║   └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ## Step 5: Integration Testing & Documentation                            │ ║
║ │ **Estimated:** 3 hours                                                     │ ║
║ │ **Dependencies:** All previous steps                                       │ ║
║ │                                                                            │ ║
║ │ ### Tasks                                                                  │ ║
║ │ - [ ] Write integration tests for notification flow                       │ ║
║ │ - [ ] Test browser notification permissions                               │ ║
║ │ - [ ] Document notification API                                           │ ║
║ │ - [ ] Update user guide with notification settings                        │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                                ║
║ FILES CHANGED (11)                                               [Expand All] ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ✚ src/orchestrator/notifications/NotificationService.ts                    │ ║
║ │ ✚ src/orchestrator/notifications/NotificationRepository.ts                 │ ║
║ │ ✚ src/shared/types/Notification.ts                                         │ ║
║ │ ✚ src/web-ui/components/NotificationCenter.tsx                             │ ║
║ │ ✚ src/web-ui/components/NotificationToast.tsx                              │ ║
║ │ ✚ src/web-ui/hooks/useNotifications.ts                                     │ ║
║ │ ✚ migrations/007_notifications.sql                                         │ ║
║ │ ✚ docs/features/notifications.md                                           │ ║
║ │ ✎ src/orchestrator/core/StateManager.ts                                    │ ║
║ │ ✎ src/orchestrator/core/RestAPI.ts                                         │ ║
║ │ ✎ src/web-ui/App.tsx                                                       │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                                ║
║ RISKS & MITIGATIONS                                                            ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ⚠ **WebSocket connection reliability**                                     │ ║
║ │    Mitigation: Implement automatic reconnection with exponential backoff  │ ║
║ │                                                                            │ ║
║ │ ⚠ **Notification overflow (too many notifications)**                       │ ║
║ │    Mitigation: Implement rate limiting and batching for bulk events       │ ║
║ │                                                                            │ ║
║ │ ℹ **Browser notification permissions required**                            │ ║
║ │    Note: Users must grant permission for desktop notifications            │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                                                ║
║ REVIEW STATUS                                                                  ║
║ ┌────────────────────────────────────────────────────────────────────────────┐ ║
║ │ ✅ ux-designer approved                                            3m ago  │ ║
║ │ ⚠ tech-lead requested changes                                      5m ago  │ ║
║ │ ⏸ Awaiting your review                                                     │ ║
║ └────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                ║
║ [💬 Add your review] [💭 Comment] [✏ Request changes] [✓ Approve]             ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

REVIEW PANEL (Bottom or Side Sheet)
┌────────────────────────────────────────────────────────────────────────────────┐
│ FINISH YOUR REVIEW                                                   [Close ✕] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│ Add your overall feedback on this plan:                                        │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Write your review comment here...                                          │ │
│ │ You can use **markdown** for formatting.                                   │ │
│ │                                                                             │ │
│ │                                                                             │ │
│ │                                                                             │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│ How do you want to submit this review?                                         │
│ ○ Comment           Leave a general comment without explicit approval          │
│ ○ Approve           Submit feedback and approve this plan                      │
│ ● Request changes   Submit feedback that must be addressed before approval     │
│                                                                                 │
│ [Cancel]                                                     [Submit review →] │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Rationale:**

- Familiar GitHub PR interface that developers know
- Inline comments on each step of the plan enable precise feedback
- Threaded discussions for collaborative review and clarifications
- Clear review status tracking (approved, changes requested, pending)
- Review panel for submitting final verdict with overall feedback
- Multiple tabs (Conversation, Files, Reviews) organize information clearly
- Files section shows what will be created/modified
- Risks & mitigations section helps identify potential issues upfront

---

## Implementation Notes

### Technical Stack

- **Frontend Framework**: React with TypeScript
- **UI Components**: Custom components based on existing terminal-kit patterns
- **Real-time Updates**: WebSocket integration (already architected via UIClientHook)
- **REST API**: All endpoints already available (see RestAPI.ts)
- **State Management**: Real-time updates via StateManager event system

### Key Features

1. **Consistent UX**: Table + details pattern for Workspaces and Workers
2. **Real-time**: Live updates via WebSocket for all views
3. **Responsive**: Designs adaptable to different screen sizes
4. **ASCII-Compatible**: Can be rendered in terminal or web browser
5. **Action-Oriented**: Clear CTAs on all interactive elements

### Data Sources

All designs leverage existing backend APIs:

- `GET /stats` - Dashboard metrics
- `GET /workspaces` - Workspace list and details
- `GET /workers` - Worker list and status
- `GET /tasks?status=review` - Review queue
- `GET /tasks/:id/trace` - Execution traces for plan review

### Next Steps

1. Create web UI project structure (React + TypeScript)
2. Implement base layout and navigation
3. Build reusable table components
4. Implement WebSocket connection manager
5. Create page components based on selected designs
6. Add interactivity and form handling
7. Test with real orchestrator data
