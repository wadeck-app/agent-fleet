# Plan: Event Subscriptions Visibility

**Date:** 2026-02-27
**Context:** Event-triggered flows are now fully wired (`EventSubscriptionRegistry`, `EventBus`, `FlowDiscoveryRegistry`), but there is no way to see from the UI which workers are listening to which events. This is a diagnostic gap: when debugging "why didn't my flow trigger?", the user has no visibility. The goal is to surface active event subscriptions clearly and logically.

---

## Where to Surface It

**The Workers page is the right home.** Rationale:

- Workers are the entities that register event subscriptions
- When a worker disconnects, its subscriptions vanish — lifecycle is tied to workers
- The Workers page is already where the user looks to understand what runs automatically

**UI pattern:** A dedicated **"Event Subscriptions" panel** below the workers table, loaded from a single endpoint. Not inline in worker rows (would require N+1 or noisy columns). Shows all active subscriptions at a glance.

When empty → "No active event subscriptions" message.
When populated → compact table: **Event | Filter | Worker | Flow**

---

## Backend Changes (2 files)

### 1. `packages/shared-frontend-backend/src/api/workers.contract.ts`

Add Zod schema + TypeScript type for the response:

```typescript
export const EventSubscriptionSchema = z.object({
	event: z.string(),
	filter: z.record(z.string(), z.string()).optional(),
	workerId: z.string(),
	flowId: z.string(),
	projectId: z.string(),
});
export type EventSubscriptionItem = z.infer<typeof EventSubscriptionSchema>;

export const EventSubscriptionsResponseSchema = z.object({
	subscriptions: z.array(EventSubscriptionSchema),
});
export type EventSubscriptionsResponse = z.infer<typeof EventSubscriptionsResponseSchema>;
```

### 2. `packages/web-backend/src/services/WorkersService.ts`

Add method (uses existing `orchestratorWrapper` access already in the class):

```typescript
async getEventSubscriptions(): Promise<EventSubscriptionsResponse> {
    const orchestrator = this.orchestratorWrapper.getOrchestrator();
    const registry = orchestrator.getEventSubscriptionRegistry();
    return { subscriptions: registry.getAll() };
}
```

### 3. `packages/web-backend/src/controllers/WorkersController.ts`

Add route **before** the `/:workerId` route to avoid param capture:

```
GET /api/workers/event-subscriptions → workersService.getEventSubscriptions()
```

Response: `EventSubscriptionsResponse` (200)

---

## Frontend Changes (delegate to `frontend-dev` agent)

### 4. `packages/web-frontend/src/app/pages/workers/workers.api.ts`

Add:

```typescript
getEventSubscriptions: () => GET('/api/workers/event-subscriptions') → EventSubscriptionsResponse
```

### 5. `packages/web-frontend/src/app/pages/workers/EventSubscriptionsPanel.tsx` (new)

Simple component rendering the subscriptions table:

- **Empty state:** "No active event subscriptions" muted text
- **Populated state:** compact table with columns:
    - **Event** — monospace, e.g. `ticket.status.changed`
    - **Filter** — inline badges for each `key=value` pair (e.g. `newStatus=pending_integration`), empty = "—"
    - **Worker** — `workerId` (monospace), optionally worker name if available
    - **Flow** — `flowId` (monospace)
- No pagination needed (subscriptions count is small in practice)

### 6. `packages/web-frontend/src/app/pages/workers/WorkersPage.tsx`

Below the `<Data2>…</Data2>` block, add:

```tsx
<EventSubscriptionsPanel />
```

The panel fetches from its own `useEffect` on mount and refreshes when `B2F_WORKER_CONNECTED` / `B2F_WORKER_DISCONNECTED` events fire (same WebSocket events the page already watches).

---

## Critical File Paths

| File                                                                      | Change                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/shared-frontend-backend/src/api/workers.contract.ts`            | Add `EventSubscriptionSchema` + response type              |
| `packages/web-backend/src/services/WorkersService.ts`                     | Add `getEventSubscriptions()`                              |
| `packages/web-backend/src/controllers/WorkersController.ts`               | Add `GET /event-subscriptions` route (before `/:workerId`) |
| `packages/web-frontend/src/app/pages/workers/workers.api.ts`              | Add `getEventSubscriptions()` call                         |
| `packages/web-frontend/src/app/pages/workers/EventSubscriptionsPanel.tsx` | New component                                              |
| `packages/web-frontend/src/app/pages/workers/WorkersPage.tsx`             | Add panel below table                                      |

---

## Implementation Order

1. Backend: contract schema → `WorkersService` method → `WorkersController` route
2. Frontend (frontend-dev agent): `workers.api.ts` → `EventSubscriptionsPanel` → `WorkersPage`

---

## Verification

1. Start a worker with a flow that has `trigger: { type: event, event: ticket.status.changed, filter: { newStatus: pending_integration } }`
2. Navigate to `/workers` → panel shows the subscription row: `ticket.status.changed | newStatus=pending_integration | <workerId> | <flowId>`
3. Disconnect the worker → panel shows "No active event subscriptions"
4. Run `npm run check` + `npm run test:agent -- --exclude="E2E*"` → all green
