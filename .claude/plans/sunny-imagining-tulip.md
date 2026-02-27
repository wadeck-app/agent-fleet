# Plan: Ticket System for Agent Fleet

**Date:** 2026-02-26
**Feature:** Jira/GitLab-like ticket system with AI-driven enrichment, event-based integration workflow

---

## Context

The user wants a ticket system layered on top of the existing Task/Flow infrastructure. Tickets are higher-level work items (like Jira epics/stories) that:

1. Are described in natural language and enriched by AI (title, labels, fields, custom flows)
2. Spawn sub-tickets (N-level hierarchy, Jira-style) and Tasks
3. Support manual drag-and-drop ordering (Jira-style float order)
4. Drive an integration workflow via event-based flow triggers

**Design principles** stressed by the user:

- **Adapter/interface-first** everywhere (TicketProvider, AgentExecutor) — no integration spaghetti
- All flows defined in YAML (existing patterns) — no hardcoded business logic in flow steps
- The flow system is extended (event triggers, `includes:` directive) not bypassed

**Existing state:**

- `Task` = execution unit with `flowId`, 15 statuses, `projectId`. Stored in `/data/tasks.json`.
- Storage = JSON file-based `FileBasedStorage` (no SQL). Per `BaseRepository<T>` pattern.
- Flows = YAML per-project, loaded by `FlowRegistry` (which already supports `source:` per-flow external references).
- No `trigger` field in `FlowDefinition`. No `Ticket` entity. No `labels` on Task.

---

## Architecture Overview

```
User submits description (UI)
       ↓
POST /api/tickets/analyze  ←── AgentExecutor (LocalClaudeAgentExecutor)
       ↓                         Reads: flow docs, existing flows, existing labels
Returns TicketAnalysisPlan       Generates: title, labels, fields, sub-tickets + flowYaml each
       ↓
UI: user reviews, edits, approves
       ↓
POST /api/tickets/create-from-plan ←── TicketProvider (InternalTicketProvider)
  1. Validates each sub-ticket flowYaml (FlowValidator)
     - If invalid: AgentExecutor.fixInvalidFlowYaml() up to 3 retries
  2. Appends valid flows to flows-custom.yml (ID: ticket-{id}-impl)
  3. Creates parent ticket + sub-tickets (with flowId = 'ticket-{id}-impl')
       ↓
Tickets appear in backlog. User orders (drag-and-drop) + moves to 'todo'
       ↓
Ticket status → 'todo': backend auto-creates Task with
  { flowId: ticket.flowId, ticketId: ticket.id }
       ↓
Worker picks up Task, executes the custom implementation flow
       ↓
On flow completion: statusTransitions.onSuccess.ticket → updates ticket status
       ↓
Ticket → 'pending_integration':
  Backend fires event 'ticket.status.changed'
       ↓
Integration worker (event trigger matches) receives { ticketId }
  → resolves: ticketId → taskIds[last] → Task.workspaceId → Workspace.gitBranch
  → merges branch into integration branch
  → updates ticket status to 'integrated'
```

---

## New Entities & Types

### `Ticket`

Stored in `/data/tickets.json`.

```typescript
interface Ticket {
	id: string;
	projectId: string;
	title: string;
	description: string;
	status: TicketStatus;
	labels: string[]; // free-form, autocompleted from project
	fields: Record<string, string>; // key::value like GitLab
	parentId?: string; // direct parent ticket (N-level hierarchy, Jira-style)
	taskIds: string[]; // execution tasks generated for this ticket
	flowId?: string; // AI-generated implementation flow (stored in flows-custom.yml)
	order: number; // float (Jira-style midpoint ordering)
	version: number; // optimistic locking
	createdAt: string;
	updatedAt: string;
}

type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled' | 'pending_integration' | 'integrated';
```

**Ordering (Jira-style):** `order` is a float. When inserting ticket between A (order=1000) and B (order=2000), new ticket gets `order=1500`. Avoids recalculating all siblings on every reorder.

### `TicketAnalysisPlan` (API response, not persisted)

```typescript
interface TicketAnalysisPlan {
	title: string;
	labels: string[];
	fields: Record<string, string>;
	complexity: 'simple' | 'medium' | 'complex';
	analysis: string;
	subTickets: Array<{
		title: string;
		description: string;
		flowYaml: string; // validated by FlowValidator before returning
	}>;
}
```

---

## New Interfaces (Adapters)

### `TicketProvider`

```typescript
// packages/web-backend/src/providers/TicketProvider.ts
interface TicketProvider {
	create(data: CreateTicketData): Promise<Ticket>;
	get(id: string): Promise<Ticket>;
	update(id: string, data: UpdateTicketData): Promise<Ticket>;
	delete(id: string): Promise<void>;
	list(filter: TicketFilter): Promise<PaginatedResult<Ticket>>;
	searchLabels(projectId: string, query: string): Promise<string[]>;
	reorder(id: string, order: number): Promise<void>;
}
// Initial impl: InternalTicketProvider (uses TicketRepository)
// Future: JiraTicketProvider, GitHubIssuesTicketProvider
```

### `AgentExecutor`

```typescript
// packages/web-backend/src/providers/AgentExecutor.ts
interface AgentExecutor {
	analyzeTicketDescription(input: TicketAnalysisInput): Promise<TicketAnalysisPlan>;
	fixInvalidFlowYaml(yaml: string, validationErrors: string[]): Promise<string>;
	suggestLabels(description: string, existingLabels: string[]): Promise<string[]>;
	// Future: KB improvement (currently out of scope)
}
// Initial impl: LocalClaudeAgentExecutor
// Future: RemoteAgentExecutor (calls external AI API)
```

---

## Flow System Extensions

### 1. `includes:` directive in `flows.yml`

New top-level directive in flows.yml (per-project):

```yaml
includes:
  - flows-custom.yml   # AI-generated flows

flow-name:
  version: '1.0.0'
  ...
```

`FlowRegistry` updated to: when loading `flows.yml`, parse `includes:`, load each referenced file, merge all flows. The `includes` paths follow same security constraints as existing `source:` (sibling files, `.yml` extension only).

`flows-custom.yml` = machine-managed file (AI-generated flows). Generated flow IDs: `ticket-{ticketId}-impl`.

### 2. `trigger` field in `FlowDefinition`

New optional field:

```typescript
interface FlowDefinition {
	// ... existing fields ...
	trigger?: FlowTrigger;
}

type FlowTrigger = EventFlowTrigger; // extensible union

interface EventFlowTrigger {
	type: 'event';
	event: 'ticket.status.changed'; // extensible
	filter: {
		status?: TicketStatus;
		projectId?: string;
	};
}
```

**Worker registration:** On connect, workers already register flows via `FlowDiscoveryRegistry`. Extended to also register event subscriptions for flows with `trigger.type: event`. The orchestrator maintains an `EventSubscriptionRegistry` mapping event+filter → worker+flowId.

**Event dispatch:** When `TicketsService.update()` changes a ticket status, it calls `EventBus.emit('ticket.status.changed', { ticketId, status, projectId })`. The `EventBus` checks `EventSubscriptionRegistry`, finds matching subscriptions, and creates Tasks assigned to those workers.

### 3. `statusTransitions` extended for ticket updates

Extended to support ticket status propagation:

```typescript
interface StatusTransitions {
	onSuccess?: TaskStatus | StatusTransitionConfig;
	onFailure?: TaskStatus | StatusTransitionConfig;
}

interface StatusTransitionConfig {
	task?: TaskStatus;
	ticket?: TicketStatus; // NEW: update the linked ticket's status
}
```

When a flow completes and `statusTransitions.onSuccess.ticket` is set, `FlowExecutor` calls the tickets API to update the linked ticket.

---

## Ticket Creation Flow (Backend-Direct, No YAML Flow)

Ticket analysis and creation are handled **entirely by the backend** via `AgentExecutor`. No YAML flow, no worker, no task queue for this step.

### `POST /api/tickets/analyze`

1. Backend loads context: flow schema docs, `flows-custom.yml`, existing project labels
2. Calls `AgentExecutor.analyzeTicketDescription({ description, projectId, context })`
3. AI assesses complexity (simple/medium/complex). If clarification needed, returns `{ needsClarification: true, questions: [...] }` → frontend shows clarification dialog → user answers → second call to analyze
4. Returns `TicketAnalysisPlan` to frontend

### `POST /api/tickets/create-from-plan`

1. For each sub-ticket with a `flowYaml`:
    - Runs `FlowValidator.validate(flowYaml)`
    - If invalid: calls `AgentExecutor.fixInvalidFlowYaml(yaml, errors)` up to 3 retries
    - If still invalid after 3 retries: returns error (sub-ticket created without a flow)
    - If valid: appends to `flows-custom.yml` with ID `ticket-{uuid}-impl`
2. Creates parent ticket + sub-tickets via `TicketProvider.create()`
3. Sub-tickets have `flowId = 'ticket-{uuid}-impl'` set on creation

### Flows YAML changes (minimal)

Only two things added to the project's `flows.yml`:

```yaml
includes:
    - flows-custom.yml # AI-generated implementation flows (machine-managed)
```

The `flows-custom.yml` is created empty on first use. Workers load it via the new `includes:` directive.

---

## Example Integration Worker Flow

```yaml
integration-worker:
    version: '1.0.0'
    name: 'Integration Worker'
    trigger:
        type: event
        event: ticket.status.changed
        filter:
            status: pending_integration
            projectId: 'my-project'
    inputs:
        ticketId: string
    steps:
        - type: script
          id: check-branch
          name: 'Check Branch for Conflicts'
          script: |
              # Get workspace branch from ticket's tasks
              BRANCH=$(curl -s "$BACKEND_URL/api/tickets/${{ inputs.ticketId }}" | jq -r '.taskIds[0]')
              # ... git operations
        - type: model
          id: resolve-or-skip
          name: 'Handle Merge Result'
          # ... handles conflicts, updates ticket status to integrated
```

---

## Implementation Steps

### Step 1 — Flow system: `includes:` directive + `trigger` field

**Files:** `packages/flow-engine/src/registry/FlowRegistry.ts`, `packages/flow-engine/src/types.ts`

- Add `includes?: string[]` to flows.yml parsing in `FlowRegistry.loadFlowsFromFile()`
- Parse `includes`, load each file, merge flows (same path security validation as `source:`)
- Add `trigger?: FlowTrigger` to `FlowDefinition` interface in `types.ts`
- Add `FlowTrigger`, `EventFlowTrigger` types

### Step 2 — Event infrastructure

**New files:** `packages/web-backend/src/events/EventBus.ts`, `packages/orchestrator/src/registry/EventSubscriptionRegistry.ts`

- `EventBus` (simple in-process EventEmitter with typed events)
- `EventSubscriptionRegistry` (tracks which worker+flow subscribes to which events)
- Extend worker registration protocol: workers send their flow triggers on connect
- `FlowDiscoveryRegistry` updated to store trigger subscriptions

### Step 3 — Domain types: Ticket

**Files:** `packages/shared-orch-worker/src/domain-types.ts`

- Add `Ticket` interface + `TicketStatus` type

**Files:** `packages/shared-frontend-backend/src/api/tickets.contract.ts` (new)

- API contract following `tasks.contract.ts` pattern
- Endpoints: CRUD + `/labels` autocomplete + `/analyze` + `/create-from-plan` + `/reorder`
- Also update `tasks.contract.ts`: add `ticketId?: string`

### Step 4 — Backend: TicketProvider + AgentExecutor

**New files:**

- `packages/web-backend/src/providers/TicketProvider.ts` — interface
- `packages/web-backend/src/providers/InternalTicketProvider.ts` — impl using TicketRepository
- `packages/web-backend/src/providers/AgentExecutor.ts` — interface
- `packages/web-backend/src/providers/LocalClaudeAgentExecutor.ts` — impl (wraps ClaudeLauncher from flow-engine)

### Step 5 — Backend: Repository + Service + Controller

**New files:**

- `packages/web-backend/src/repositories/TicketRepository.ts` — `new BaseRepository<Ticket>(storage, 'tickets')` + label query
- `packages/web-backend/src/services/TicketsService.ts` — CRUD, label search, reorder (Jira-style float), event emission on status change
- `packages/web-backend/src/controllers/TicketsController.ts` — route handlers with Zod validation

Register in Fastify (follow existing controllers registration pattern).

### Step 6 — statusTransitions extension

**Files:** `packages/flow-engine/src/types.ts`, `packages/flow-engine/src/executor/FlowOrchestrator.ts` (or `FlowExecutor.ts`)

- Extend `StatusTransitions` with optional `ticket?: TicketStatus`
- When flow completes, if `statusTransitions.onSuccess.ticket` is set, call `$BACKEND_URL/api/tickets/:ticketId` PATCH via script or backend hook

### Step 7 — Flows YAML

**File:** `.agent-fleet/flows.yml` (per project)

- Add `includes: [flows-custom.yml]` at top
- Create empty `flows-custom.yml` in same directory (machine-managed by backend)

### Step 8 — Frontend (delegate to `frontend-dev` agent)

**Components:**

- `/tickets` — List page: project filter, status filter, hierarchy view toggle, drag-and-drop ordering, "Create from description" button
- `/tickets/:id` — Detail: editable title/description/status, `LabelAutocomplete` chip input, `KeyValueEditor` for fields, sub-tickets section (with parentId link like Jira's "Epic link"), linked tasks section
- `LabelAutocomplete.tsx` — Calls `GET /api/tickets/labels?projectId=X&q=Y`, renders autocomplete chip input
- `KeyValueEditor.tsx` — Add/edit/remove key::value pairs
- `TicketCreateDialog.tsx` — Description input → POST /api/tickets/analyze → (optional clarification Q&A) → shows TicketAnalysisPlan → user edits/approves → POST /api/tickets/create-from-plan

---

## Critical File Paths

| Component                                          | Path                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Domain types (add Ticket)                          | `packages/shared-orch-worker/src/domain-types.ts`                 |
| Flow types (add trigger, extend statusTransitions) | `packages/flow-engine/src/types.ts`                               |
| FlowRegistry (add includes)                        | `packages/flow-engine/src/registry/FlowRegistry.ts`               |
| API contract (new)                                 | `packages/shared-frontend-backend/src/api/tickets.contract.ts`    |
| TicketRepository (new)                             | `packages/web-backend/src/repositories/TicketRepository.ts`       |
| TicketsService (new)                               | `packages/web-backend/src/services/TicketsService.ts`             |
| TicketsController (new)                            | `packages/web-backend/src/controllers/TicketsController.ts`       |
| TicketProvider interface (new)                     | `packages/web-backend/src/providers/TicketProvider.ts`            |
| AgentExecutor interface (new)                      | `packages/web-backend/src/providers/AgentExecutor.ts`             |
| LocalClaudeAgentExecutor (new)                     | `packages/web-backend/src/providers/LocalClaudeAgentExecutor.ts`  |
| EventBus (new)                                     | `packages/web-backend/src/events/EventBus.ts`                     |
| EventSubscriptionRegistry (new)                    | `packages/orchestrator/src/registry/EventSubscriptionRegistry.ts` |
| flows.yml (per project)                            | `.agent-fleet/flows.yml`                                          |
| flows-custom.yml (new)                             | `.agent-fleet/flows-custom.yml`                                   |

### Patterns to reuse:

- `TasksRepository.ts` → `TicketRepository.ts`
- `TasksService.ts` → `TicketsService.ts`
- `TasksController.ts` → `TicketsController.ts`
- `tasks.contract.ts` → `tickets.contract.ts`
- `BaseRepository<T>` from `packages/web-backend/src/repositories/`
- `FlowValidator` from `packages/flow-engine/src/validation/`
- `ClaudeLauncher` from `packages/flow-engine/src/executor/` (reuse in LocalClaudeAgentExecutor)

---

## Out of Scope (Deferred)

- `KnowledgeProvider` adapter (KB improvement step) — interface + impl deferred
- External TicketProviders (Jira, GitHub Issues) — `InternalTicketProvider` only for now
- `RemoteAgentExecutor` — `LocalClaudeAgentExecutor` only for now
- Real-time WebSocket updates for tickets — reuse existing task WebSocket patterns later
- Ticket assignment to specific users/teams

---

## Verification

1. **includes directive**: Add a test flow to `flows-custom.yml`, verify `FlowRegistry` loads it
2. **Event trigger**: Create a flow with `trigger.type: event`, start a worker, change a ticket status → verify flow executes
3. **Ticket CRUD**: POST/GET/PATCH/DELETE via `api/tickets`, verify `/data/tickets.json` is updated
4. **Label autocomplete**: Create tickets with labels, query `/api/tickets/labels?projectId=X&q=b` → correct results
5. **Ordering**: Create 3 tickets (order 1000, 2000, 3000), reorder middle one to first → order = 500; verify siblings untouched
6. **AgentExecutor analysis**: POST `/api/tickets/analyze` with "make button red" → returns simple 1-step flowYaml. POST with "build auth system" → returns complex plan with interview questions first
7. **Flow validation + retry**: Inject an invalid flowYaml in create-from-plan → verify 3 retry attempts with FlowValidator errors fed back to AgentExecutor
8. **Auto-task-creation**: Move ticket to 'todo' with `flowId` set → verify Task auto-created with correct `flowId` and `ticketId`
9. **statusTransitions.ticket**: Create a flow with `onSuccess: { ticket: done }`, complete it → verify linked ticket status updated
10. **Frontend**: Full lifecycle — description input → analysis plan → approval → backlog → reorder → move to todo → task auto-created → view hierarchy
