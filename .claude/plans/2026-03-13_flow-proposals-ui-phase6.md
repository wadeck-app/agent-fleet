# Plan: Ticket → Flow Pipeline — Phases 1+2+3

## Context

The codebase currently has a hardcoded `TicketStatus` enum and a fixed Zod `z.enum([...])` for ticket status.
The goal is to make ticket statuses project-configurable (each project defines its own), expose APIs for
flow feedback/retrospective (as plain data — no hardcoded step type), and auto-generate a FlowCapabilities
document so `FlowDesignerAgent` (Phase 4) can understand what the flow engine supports.

Corrections vs original plan:

- `plan_in_review`/`plan_approved` already in `tickets.contract.ts` → removed (superseded by project-defined statuses)
- No new `retrospective` step type — retrospective is a reusable sub-flow pattern using existing step types + APIs
- `FlowDesignerAgent` → `/agents/` (new directory, generic feature)
- Step dispatch lives in `StepRunner.ts`, not `FlowExecutor.ts`

---

## Phase 1 — Project-Configurable Ticket Statuses

### 1.1 De-hardcode `TicketStatus`

**`packages/shared-orch-worker/src/domain-types.ts`**

- Change `export enum TicketStatus { ... }` → `export type TicketStatus = string`
- Add `export const DEFAULT_TICKET_STATUSES = ['backlog', 'todo', 'in_progress', 'done', 'cancelled', 'pending_integration', 'integrated'] as const`
- All existing references to `TicketStatus.XXX` → use the string literal directly

**`packages/shared-frontend-backend/src/api/tickets.contract.ts`**

- `TicketStatusSchema = z.enum([...])` → `z.string()`
- Remove `plan_in_review` and `plan_approved` from the enum (they become project-defined)
- Keep `TicketStatus` type as `z.infer<typeof TicketStatusSchema>`

Impact: scan for all usages of `TicketStatus.XXX` enum values across backend + frontend and replace with string literals.
Key files to check: `TicketsService.ts`, `TicketsPage.tsx`, `TicketDetailLayoutG.tsx` and all layouts.

### 1.2 `ProjectStatusConfig` schema

**`packages/shared-frontend-backend/src/api/projects.contract.ts`** (exists — add to it)

```ts
export const StatusDefinitionSchema = z.object({
	id: z.string(),
	label: z.string(),
	terminal: z.boolean().default(false),
	color: z.string().optional(),
});

export const StatusTransitionSchema = z.object({
	from: z.string(),
	to: z.string(),
});

export const ProjectStatusConfigSchema = z.object({
	statuses: z.array(StatusDefinitionSchema),
	transitions: z.array(StatusTransitionSchema),
});

export type ProjectStatusConfig = z.infer<typeof ProjectStatusConfigSchema>;

export const DEFAULT_STATUS_CONFIG: ProjectStatusConfig = {
	statuses: [
		{ id: 'backlog', label: 'Backlog', terminal: false },
		{ id: 'todo', label: 'To Do', terminal: false },
		{ id: 'in_progress', label: 'In Progress', terminal: false },
		{ id: 'flow_analysis', label: 'Flow Analysis', terminal: false },
		{ id: 'flow_proposed', label: 'Flow Proposed', terminal: false },
		{ id: 'flow_approved', label: 'Flow Approved', terminal: false },
		{ id: 'done', label: 'Done', terminal: true },
		{ id: 'cancelled', label: 'Cancelled', terminal: true },
		{ id: 'pending_integration', label: 'Pending Integration', terminal: false },
		{ id: 'integrated', label: 'Integrated', terminal: true },
	],
	transitions: [],
};
```

Add routes to the tickets contract (or a dedicated projects sub-contract):

```
GET  /api/projects/:projectId/status-config
PUT  /api/projects/:projectId/status-config   body: ProjectStatusConfigSchema
```

### 1.3 Backend

**`packages/web-backend/src/repositories/ProjectsRepository.ts`** (exists — add method)

- `getStatusConfig(projectId): Promise<ProjectStatusConfig>` — reads from project's stored config; returns `DEFAULT_STATUS_CONFIG` if none
- `saveStatusConfig(projectId, config): Promise<void>`

**`packages/web-backend/src/services/ProjectsService.ts`** (check if exists, create if not)

- `getStatusConfig(projectId)` → delegates to repo
- `saveStatusConfig(projectId, config)` → validates + saves
- Validation: fail fast if any `transitions[].from/to` references an unknown status id

**`packages/web-backend/src/controllers/ProjectsController.ts`** (check if exists)

- Add `GET /api/projects/:projectId/status-config`
- Add `PUT /api/projects/:projectId/status-config`

**`packages/web-backend/src/factories/DataStoreFactory.ts`**

- Register `ProjectsService` if not already present

**`packages/web-backend/src/routes.ts`**

- Register `ProjectsController`

### 1.4 Frontend (delegate to `frontend-dev` agent)

- `useProjectStatusConfig` hook: `GET /api/projects/:projectId/status-config`
- Replace hardcoded status dropdowns in `TicketDetailLayoutG.tsx` and other layouts with dynamic list from config
- Status badge colors driven by `color` field from config

### 1.5 Tests

- `ProjectsService.getStatusConfig` — missing config → returns DEFAULT
- `ProjectsService.saveStatusConfig` — invalid transition reference → throws
- `TicketsService.updateTicket` — any string status accepted (no enum rejection)

---

## Phase 2 — Flow Feedback & Retrospective APIs

No new step type. The retrospective is a capability: the project builds a sub-flow that calls these APIs
using standard `script` or `model` steps.

### 2.1 Zod schemas

**New file: `packages/shared-frontend-backend/src/api/flow-feedback.contract.ts`**

```ts
export const FlowFeedbackSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	flowId: z.string(),
	taskId: z.string(),
	rating: z.number().int().min(1).max(5),
	wentWell: z.array(z.string()),
	wentWrong: z.array(z.string()),
	suggestions: z.array(z.string()).optional(),
	submittedAt: z.string(),
	author: z.string(),
});

export const CreateFlowFeedbackSchema = FlowFeedbackSchema.omit({ id: true, submittedAt: true });

export const FlowRetrospectiveSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	flowId: z.string(),
	taskId: z.string(),
	wentWell: z.array(z.string()),
	wentWrong: z.array(z.string()),
	suggestions: z.array(z.string()),
	executionSummary: z.string(),
	generatedAt: z.string(),
});

export const CreateFlowRetrospectiveSchema = FlowRetrospectiveSchema.omit({ id: true, generatedAt: true });
```

Export from `packages/shared-frontend-backend/src/api/index.ts`.

### 2.2 Ticket history events

**`packages/shared-frontend-backend/src/api/tickets.contract.ts`**

Extend `TicketHistoryEventSchema` union with:

- `'flow.feedback_submitted'`
- `'flow.retrospective_generated'`

### 2.3 Ticket schema fields

**`packages/shared-frontend-backend/src/api/tickets.contract.ts`**

Add to `TicketSchema`:

```ts
flowFeedbackId: z.string().optional(),
flowRetrospectiveId: z.string().optional(),
```

### 2.4 Backend

**`packages/web-backend/src/repositories/FlowFeedbackRepository.ts`** (new)

- `create(feedback)`, `findByTicketId(ticketId)`, `findByFlowId(flowId)`
- `createRetrospective(retro)`, `findRetrospectiveByTicketId(ticketId)`

**`packages/web-backend/src/services/FlowFeedbackService.ts`** (new)

- `submitFeedback(ticketId, data)` → create + emit `flow.feedback_submitted` history entry + update ticket `flowFeedbackId`
- `submitRetrospective(ticketId, data)` → create + emit `flow.retrospective_generated` + update ticket `flowRetrospectiveId`
- `getFeedbackForFlow(flowId)` → aggregated list
- `getRetrospective(ticketId)` → single retrospective

**`packages/web-backend/src/controllers/FlowFeedbackController.ts`** (new)

```
POST  /api/tickets/:ticketId/feedback
GET   /api/flows/:flowId/feedback
POST  /api/tickets/:ticketId/retrospective
GET   /api/tickets/:ticketId/retrospective
```

**`packages/web-backend/src/factories/DataStoreFactory.ts`**

- Register `FlowFeedbackService` + `FlowFeedbackRepository`

**`packages/web-backend/src/routes.ts`**

- Register `FlowFeedbackController`

### 2.5 Tests

- `FlowFeedbackService.submitFeedback` — happy path + history entry emitted
- `FlowFeedbackService.submitRetrospective` — happy path + ticket updated
- `FlowFeedbackController` — 4 endpoints, nominal + 404 cases

### 2.6 Frontend (delegate to `frontend-dev` agent — LATER)

Deferred to Phase 6. No UI for Phase 2.

---

## Phase 3 — FlowCapabilitiesGenerator

Auto-generates a Markdown document describing all flow engine capabilities.
Used as context injected into `FlowDesignerAgent` prompt (Phase 4).

### 3.1 New file

**`packages/flow-engine/src/docs/FlowCapabilitiesGenerator.ts`**

```ts
export class FlowCapabilitiesGenerator {
	generate(): string; // returns structured Markdown
}
```

Content generated from existing TypeScript types (no runtime reflection — hardcoded structure mirroring types):

- Step types: `model`, `script`, `subflow`, `user_intervention` — with their key fields and semantics
- Variable types: all 24 `VariableType` values from `types.ts`
- Template syntax: `${{ steps.X.outputs.Y }}`, `${{ inputs.X }}`, `${{ flow.allLogs }}`
- Workspace modes: `isolated | shared | manual`
- `statusTransitions`: `onSuccess`/`onFailure` fields with ticket/task transition semantics
- Intervention types: `approval`, `question`, `choice`
- Available feedback/retrospective API endpoints (from Phase 2)

### 3.2 Export

**`packages/flow-engine/src/index.ts`**

- Add `export { FlowCapabilitiesGenerator } from './docs/FlowCapabilitiesGenerator'`

### 3.3 Tests

- `FlowCapabilitiesGenerator.generate()` — output is non-empty, contains key sections (step types, variable types, template syntax)

---

## Files to touch

| File                                                                 | Action                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/shared-orch-worker/src/domain-types.ts`                    | `TicketStatus` enum → `type` + constants                                                                           |
| `packages/shared-frontend-backend/src/api/tickets.contract.ts`       | `z.string()` for status, remove `plan_in_review`/`plan_approved`, add feedback/retro fields, extend history events |
| `packages/shared-frontend-backend/src/api/projects.contract.ts`      | Add `ProjectStatusConfigSchema` + `DEFAULT_STATUS_CONFIG`                                                          |
| `packages/shared-frontend-backend/src/api/flow-feedback.contract.ts` | New file                                                                                                           |
| `packages/shared-frontend-backend/src/api/index.ts`                  | Export new contracts                                                                                               |
| `packages/web-backend/src/repositories/ProjectsRepository.ts`        | Add `getStatusConfig`/`saveStatusConfig`                                                                           |
| `packages/web-backend/src/services/ProjectsService.ts`               | Add or create with status config methods                                                                           |
| `packages/web-backend/src/controllers/ProjectsController.ts`         | Add or create with 2 new routes                                                                                    |
| `packages/web-backend/src/repositories/FlowFeedbackRepository.ts`    | New file                                                                                                           |
| `packages/web-backend/src/services/FlowFeedbackService.ts`           | New file                                                                                                           |
| `packages/web-backend/src/controllers/FlowFeedbackController.ts`     | New file                                                                                                           |
| `packages/web-backend/src/factories/DataStoreFactory.ts`             | Register new services                                                                                              |
| `packages/web-backend/src/routes.ts`                                 | Register new controllers                                                                                           |
| `packages/flow-engine/src/docs/FlowCapabilitiesGenerator.ts`         | New file                                                                                                           |
| `packages/flow-engine/src/index.ts`                                  | Export `FlowCapabilitiesGenerator`                                                                                 |

Frontend changes for Phase 1 (status dropdown) → delegate to `frontend-dev` agent.

---

## Execution order

```
1. Patch shared contracts (tickets status → string, remove plan_in_review/plan_approved)
2. Scan + fix all TicketStatus.XXX usages (backend + frontend)
3. Add ProjectStatusConfig to projects.contract.ts
4. Backend: ProjectsRepository + ProjectsService + ProjectsController
5. Add flow-feedback.contract.ts
6. Backend: FlowFeedbackRepository + FlowFeedbackService + FlowFeedbackController
7. Wire DataStoreFactory + routes.ts
8. FlowCapabilitiesGenerator
9. Run build + tests
10. Delegate frontend status dropdown to frontend-dev agent
```

---

## Verification

1. `npm run build` — all workspaces compile
2. `npm run test:agent` — existing tests pass, new service tests pass
3. Manual: `PUT /api/projects/:id/status-config` with custom statuses → `GET` returns them
4. Manual: `POST /api/tickets/:id/feedback` → history entry visible in ticket detail audit log
5. Manual: `FlowCapabilitiesGenerator.generate()` in a Node REPL — output is readable Markdown
