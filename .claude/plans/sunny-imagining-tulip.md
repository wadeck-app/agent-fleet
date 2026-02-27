# Plan: Ticket Feature — Remaining Work

**Date:** 2026-02-26
**Context:** The ticket system (CRUD, AI analysis, TicketsPage, TicketCreateDialog) is fully implemented. This plan covers the 3 back-end wiring gaps and 3 front-end gaps needed to make the feature complete.

---

## What's Already Done

- Ticket entity + API contract + repository + service + controller
- `EventBus` class (not instantiated), `EventSubscriptionRegistry` class (not wired)
- `FlowRegistry` with `includes:` directive, `FlowDefinition.trigger?: FlowTrigger`
- `StatusTransitions` with `ticket?: string` field (type only, not applied)
- Worker sends `trigger: flow.trigger` in `FlowMetadata` (but field not declared in the type)
- `TicketsPage` (list + project filter + create dialog)

---

## Back-End: 3 Gaps

### Gap 1 — `statusTransitions.ticket` not applied after flow completion

**Problem:** When a flow completes, its `statusTransitions.onSuccess.ticket` / `.onFailure.ticket` field is defined but never used. The linked ticket is never updated.

**Path:** `FlowWorker` → W2O message → `WorkerCoordinator` → `BackendEventBridge` → `OrchestratorEventHandler`

**Changes:**

1. **`packages/flow-engine/src/types.ts`**
    - Change `StatusTransitionConfig.ticket?: string` → `ticket?: TicketStatus` (import `TicketStatus` from `shared-orch-worker`)

2. **`packages/worker/src/flow/FlowWorker.ts`** (~line 860)
    - After resolving `successStatus`/`failureStatus`, also resolve:
        ```typescript
        const resolveTicketStatus = (value: TaskStatus | StatusTransitionConfig | undefined) =>
        	typeof value === 'object' ? value.ticket : undefined;
        const successTicketStatus = resolveTicketStatus(flow.statusTransitions?.onSuccess);
        const failureTicketStatus = resolveTicketStatus(flow.statusTransitions?.onFailure);
        ```
    - In `sendTaskCompleted(result, successStatus)`: add `ticketId: this.currentTask.ticketId, ticketStatus: successTicketStatus`
    - In `sendTaskFailed(error, failureStatus)`: add `ticketId: this.currentTask.ticketId, ticketStatus: failureTicketStatus`

3. **`packages/orchestrator/src/core/WorkerCoordinator.ts`** (~line 219)
    - Forward `ticketId` + `ticketStatus` in `sendToBackend('task_completed', { ... })`

4. **`packages/web-backend/src/services/OrchestratorEventHandler.ts`**
    - Add optional `TicketsService` constructor param
    - In `handleTaskCompleted()`: if `ticketId && ticketStatus` → call `ticketsService.updateTicketStatusById(ticketId, ticketStatus)`

5. **`packages/web-backend/src/services/TicketsService.ts`**
    - Add `updateTicketStatusById(ticketId: string, newStatus: TicketStatus): Promise<void>` — fetches ticket to get current version, then calls `update()` internally

6. **`packages/web-backend/src/factories/DataStoreFactory.ts`**
    - Inject `TicketsService` into `OrchestratorEventHandler` constructor

---

### Gap 2 — `FlowMetadata.trigger` not typed + `EventSubscriptionRegistry` never populated

**Problem:** Workers send `trigger` in flow metadata (`FlowWorker.ts:791`) but `FlowMetadata` interface in `shared-orch-worker` doesn't declare the field. `FlowDiscoveryRegistry.indexFlows()` never calls `EventSubscriptionRegistry.register()`, so event-triggered flows are never registered.

**Changes:**

1. **`packages/shared-orch-worker/src/domain-types.ts`**
    - Add minimal `FlowTrigger` type (mirrors `flow-engine` types, no import to avoid circular deps):
        ```typescript
        export interface FlowTrigger {
        	type: 'event';
        	event: string;
        	filter?: Record<string, string | undefined>;
        }
        ```
    - Add `trigger?: FlowTrigger` to `FlowMetadata`

2. **`packages/orchestrator/src/registry/FlowDiscoveryRegistry.ts`**
    - Accept `EventSubscriptionRegistry` as optional constructor param
    - In `indexFlows()` (~line 349): for each flow with `flow.trigger?.type === 'event'`, call `eventSubscriptionRegistry?.register({ workerId, flowId: flow.id, projectId, event: flow.trigger.event, filter: flow.trigger.filter })`
    - In `unregisterWorker()`: call `eventSubscriptionRegistry?.unregisterWorker(workerId)`

3. **`packages/orchestrator/src/core/Orchestrator.ts`**
    - Instantiate `EventSubscriptionRegistry`
    - Pass it to `FlowDiscoveryRegistry` constructor
    - Expose via `getEventSubscriptionRegistry(): EventSubscriptionRegistry`

---

### Gap 3 — `EventBus` never instantiated, status changes never dispatch Tasks

**Problem:** `TicketsService` only emits `B2F_TICKET_STATUS_CHANGED` (frontend WebSocket). `EventBus` exists as a class but is never instantiated. No code bridges the backend event to `EventSubscriptionRegistry` → `TaskManager`.

**Changes:**

1. **`packages/web-backend/src/services/TicketsService.ts`**
    - Add optional `EventBus` constructor param
    - In `updateTicket()` (~line 214), after emitting `B2F_TICKET_STATUS_CHANGED`, also:
        ```typescript
        this.eventBus?.emit('ticket.status.changed', {
        	ticketId: updated.id,
        	projectId: updated.projectId,
        	oldStatus: existingTicket.status,
        	newStatus: updated.status,
        });
        ```

2. **`packages/web-backend/src/factories/DataStoreFactory.ts`**
    - Instantiate `EventBus` as singleton: `private readonly eventBus = new EventBus()`
    - Inject into `TicketsService` constructor
    - In `initializeOrchestratorIntegration()`, wire:
        ```typescript
        this.eventBus.on('ticket.status.changed', async payload => {
        	const registry = this.orchestrator.getEventSubscriptionRegistry();
        	const matches = registry.findMatching({
        		event: 'ticket.status.changed',
        		payload: { newStatus: payload.newStatus, projectId: payload.projectId },
        	});
        	for (const sub of matches) {
        		await this.orchestrator.getTaskManager().createTask(`ticket.status.changed: ${payload.ticketId}`, {
        			flowId: sub.flowId,
        			projectId: payload.projectId,
        			ticketId: payload.ticketId,
        		});
        	}
        });
        ```

---

## Front-End: 3 Gaps

> **All frontend work must be delegated to the `frontend-dev` agent** (CLAUDE.md requirement).

### Gap 4 — No ticket detail view

**Files to create:**

- `packages/web-frontend/src/app/pages/tickets/useTicket.ts`
- `packages/web-frontend/src/app/pages/tickets/TicketDetailPage.tsx`

**`useTicket.ts`** — follow `packages/web-frontend/src/app/pages/tasks/hooks/useTask.ts` pattern with `useAsyncData`.

**`TicketDetailPage.tsx`** sections:

- **Header**: editable title (`Input`), status `Select` (7 values), delete button
- **Description**: `Textarea` (editable, auto-save)
- **Labels**: multi-value using `ComboboxInput` (`packages/web-frontend/src/framework/features/forms/inputs/ComboboxInput.tsx`) + `ticketsApi.getLabels()` for async suggestions
- **Fields**: key-value pairs using `EditableListField` (`packages/web-frontend/src/framework/components2/list/EditableListField.tsx`) with a custom `renderItem` for `{ key: string, value: string }`
- **Sub-tickets**: list child tickets (by `parentId`) with status badges
- **Tasks**: linked task IDs with status badges, link to `/tasks/:id`

All edits use `ticketsApi.updateTicket()` with `version` for optimistic locking.

**`packages/web-frontend/src/app/App.tsx`**:

- Add `<Route path="/tickets/:id" element={<TicketDetailPage />} />`

**`packages/web-frontend/src/app/pages/tickets/TicketsPage.tsx`**:

- Change `handleTicketClick` to navigate to `/tickets/${ticket.id}`

---

### Gap 5 — No drag-and-drop ordering in `TicketsPage`

**Reuse existing:**

- `useDragAndDrop` — `packages/web-frontend/src/framework/hooks2/form/useDragAndDrop.ts`
- `DragHandle` — `packages/web-frontend/src/framework/components2/primitives/DragHandle.tsx`
- `SortableItem` — `packages/web-frontend/src/framework/components2/list/SortableItem.tsx`

**Changes to `TicketsPage.tsx`:**

1. Wrap list with `DndContext + SortableContext`
2. Wrap each row with `SortableItem`, add `DragHandle`
3. On drag end: compute midpoint order (Jira-style: `(prev.order + next.order) / 2`)
4. Call `ticketsApi.reorderTicket(ticket.id, { order: newOrder, version: ticket.version })`
5. Optimistic local state update; reload on error

---

### Gap 6 — `LabelAutocomplete` and `KeyValueEditor`

No standalone components needed. Both are implemented inline in `TicketDetailPage.tsx`:

- **Labels**: `ComboboxInput` with async options from `ticketsApi.getLabels()`
- **Fields**: `EditableListField` with a `renderItem` rendering two `Input` fields (key / value)

---

## Critical File Paths

| File                                                               | Change                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `packages/shared-orch-worker/src/domain-types.ts`                  | Add `FlowTrigger` type + `trigger?: FlowTrigger` to `FlowMetadata`              |
| `packages/flow-engine/src/types.ts`                                | `StatusTransitionConfig.ticket?: TicketStatus`                                  |
| `packages/worker/src/flow/FlowWorker.ts`                           | Resolve + forward `ticketId` + `ticketStatus`                                   |
| `packages/orchestrator/src/core/WorkerCoordinator.ts`              | Forward `ticketId` + `ticketStatus` to BackendEventBridge                       |
| `packages/orchestrator/src/core/Orchestrator.ts`                   | Instantiate `EventSubscriptionRegistry`, expose getter                          |
| `packages/orchestrator/src/registry/FlowDiscoveryRegistry.ts`      | Register event triggers on flow index; unregister on worker disconnect          |
| `packages/web-backend/src/services/TicketsService.ts`              | Emit to `EventBus`; add `updateTicketStatusById()`                              |
| `packages/web-backend/src/services/OrchestratorEventHandler.ts`    | Handle `ticketId`+`ticketStatus`; inject `TicketsService`                       |
| `packages/web-backend/src/factories/DataStoreFactory.ts`           | Instantiate `EventBus`; wire EventBus → EventSubscriptionRegistry → TaskManager |
| `packages/web-frontend/src/app/App.tsx`                            | Add `/tickets/:id` route                                                        |
| `packages/web-frontend/src/app/pages/tickets/TicketsPage.tsx`      | Navigate on click + drag-and-drop                                               |
| `packages/web-frontend/src/app/pages/tickets/useTicket.ts`         | New hook                                                                        |
| `packages/web-frontend/src/app/pages/tickets/TicketDetailPage.tsx` | New detail page                                                                 |

---

## Implementation Order

1. **Gap 2 first** — `shared-orch-worker` types (`FlowTrigger` in `FlowMetadata`) — unblocks Gap 1 typing too
2. **Gap 1** — `flow-engine/types.ts` + `FlowWorker` + `WorkerCoordinator` + `OrchestratorEventHandler` + `TicketsService.updateTicketStatusById` + `DataStoreFactory`
3. **Gap 2 rest** — `FlowDiscoveryRegistry` + `Orchestrator.getEventSubscriptionRegistry()`
4. **Gap 3** — `EventBus` instantiation + `TicketsService` emit + `DataStoreFactory` wiring
5. **Gaps 4–6** (frontend, via `frontend-dev` agent) — `useTicket` + `TicketDetailPage` + route + drag-and-drop

---

## Verification

1. **statusTransitions.ticket**: Create flow with `statusTransitions: { onSuccess: { task: review, ticket: done } }`. Create ticket, move to `todo` (auto-creates task), complete task via worker → ticket status becomes `done`.
2. **Event-triggered flows**: Register worker with flow having `trigger: { type: event, event: ticket.status.changed, filter: { newStatus: pending_integration } }`. Move ticket to `pending_integration` → orchestrator creates task for that worker.
3. **Ticket detail**: Navigate to `/tickets/:id` → see full detail, edit title/status/labels/fields, changes persisted with optimistic locking.
4. **Drag-and-drop**: Drag ticket between two others → `reorderTicket` called with midpoint order, list reorders.
5. Run `npm run check` + `npm run test:agent` — all green.
