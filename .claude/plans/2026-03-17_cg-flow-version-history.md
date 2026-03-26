# Feature Plan: Flow Version History & Forking (item cg)

**Date:** 2026-03-17
**Request:** Allow users to navigate back to previous flow design versions and request changes starting from a specific past version (forking).

---

## Current State Analysis

### What already exists

- `GET /api/tickets/:ticketId/flow-proposals` **already returns ALL versions** for a ticket, sorted by version descending (newest first). The `FlowProposalsService.getProposals()` method fetches via `findByTicketId()` (no filtering — all statuses returned). No `?includeHistory` parameter is needed; the data is already there.
- `FlowProposal` already carries a `version: number` field and a `status` field (`pending_review | approved | rejected | superseded`).
- `useFlowProposals` already receives the full `proposals[]` array but `currentProposal` is always `proposals[0]` — the rest of the list is unused by the UI.
- `FlowProposalSection` only renders `currentProposal`. Older versions are silently discarded.
- Rejection already triggers an async redesign that bumps the version counter. The new version is created in `triggerRedesignAsync` with `version: rejectedProposal.version + 1`.
- `RequestFlowDesignSchema` only accepts `{ context?: string }`. There is no `basedOnVersion` field today.

### Key insight

The backend already has everything needed for Phase 1. The work is almost entirely frontend + a small contract extension for the forking POST body.

---

## Phase 1 — Backend: Expose fork-from-version endpoint

**Complexity: S**

### 1.1 — Verify history endpoint (no change needed)

`GET /api/tickets/:ticketId/flow-proposals` already returns all proposals. The frontend just needs to use `proposals` (the full array), not only `currentProposal`. No backend change required for history.

### 1.2 — Extend `RequestFlowDesignSchema` for forking

File: `packages/shared-frontend-backend/src/api/flow-proposals.contract.ts`

Add `basedOnVersion` to the request schema:

```ts
export const RequestFlowDesignSchema = z.object({
	context: z.string().optional(),
	basedOnVersion: z.number().int().positive().optional(),
});
```

This field tells the backend: "start the new design from proposal version N, then apply `context` as change instructions on top."

### 1.3 — Update `FlowProposalsService.requestFlowDesign`

File: `packages/web-backend/src/services/FlowProposalsService.ts`

When `basedOnVersion` is provided:

1. Look up the existing proposal with that version number for the ticket via `proposalsRepository.findByTicketId()`.
2. If not found, throw a `BadRequestException`.
3. Pass the found proposal's YAML + reasoning as `previousProposal` to `FlowDesignerAgent.designFlow()` — same structure already used by `triggerRedesignAsync`.
4. The `context` field becomes the "change instructions" on top of the old version.

This reuses the existing `previousProposal` input path in `FlowDesignerAgent` — no agent changes needed.

### 1.4 — Add `basedOnVersion` to ticket history entry

In `requestFlowDesign`, add `basedOnVersion` to the `flow.design_requested` history entry when set. This makes the audit log informative.

### Files changed (Phase 1)

| File                                                                  | Change                                            |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/shared-frontend-backend/src/api/flow-proposals.contract.ts` | Add `basedOnVersion` to `RequestFlowDesignSchema` |
| `packages/web-backend/src/services/FlowProposalsService.ts`           | Handle `basedOnVersion` in `requestFlowDesign`    |
| `packages/web-backend/src/services/FlowProposalsService.test.ts`      | Tests for fork-from-version path                  |

### Risk areas (Phase 1)

- Version lookup must be scoped to the ticket (`ticketId` + `version`), not just `version` globally.
- If the referenced version is `approved`, forking it is valid — it means "redesign from this approved base". No status guard needed.
- If `basedOnVersion` points to the current `pending_review` proposal, it is a no-op conceptually but still valid — just creates a new version on top.

---

## Phase 2 — Frontend: Version history timeline

**Complexity: M**

### 2.1 — `useFlowProposals` — expose past proposals

File: `packages/web-frontend/src/app/pages/tickets/useFlowProposals.ts`

The hook already returns `proposals[]`. Add a derived value:

```ts
// proposals[0] is the current (highest version); the rest are history
const historyProposals = proposals.slice(1);
```

Expose `historyProposals` in `UseFlowProposalsResult`. No fetch change needed.

### 2.2 — New component `ProposalHistoryEntry`

File: `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx` (or split into `FlowProposalHistory.tsx`)

Renders a single past proposal in collapsed form:

```
v2  [rejected]  2026-03-15 14:32   [>] expand
v1  [rejected]  2026-03-14 09:10   [>] expand
```

When expanded, shows:

- Reasoning (same collapsible pattern as `ProposalView`)
- YAML in `<pre>` block
- Confidence score badge
- "Fork from this version" button (see Phase 3)

### 2.3 — Version history collapsible section in `FlowProposalSection`

Below the `currentProposal` block, add a collapsible "Version history (N)" section:

```
[v] Version history (2)
  v2  rejected  Mar 15  [expand]
  v1  rejected  Mar 14  [expand]
```

Only shown when `historyProposals.length > 0`.

Use the same `ChevronDown / ChevronRight` + `Button variant="ghost"` pattern already used for Reasoning.

### Files changed (Phase 2)

| File                                                                       | Change                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/web-frontend/src/app/pages/tickets/useFlowProposals.ts`          | Add `historyProposals` to returned object                          |
| `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`      | Add `ProposalHistoryEntry` component + collapsible history section |
| `packages/web-frontend/src/app/pages/tickets/useFlowProposals.test.ts`     | Assert `historyProposals` slicing                                  |
| `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.test.tsx` | Snapshot / behaviour tests for history section                     |

### Risk areas (Phase 2)

- Long YAML in history entries can be large. The `<pre>` block must have `max-h` + `overflow-y-auto` to avoid giant page blowup.
- Only one history entry should be expanded at a time (accordion behaviour) to avoid overwhelming the page. Track `expandedVersionId: string | null` in local state.
- The "current" proposal (v3 `pending_review`) must not appear in the history list — `proposals.slice(1)` handles this correctly since the backend sorts by version desc.

---

## Phase 3 — Frontend: Forking / request changes from old version

**Complexity: M**

### 3.1 — "Fork from this version" flow

When the user clicks "Fork from this version" on a history entry:

1. Scroll to (or reveal) the "Request a new flow design" form at the bottom of `FlowProposalSection`.
2. Pre-populate a hidden `basedOnVersion` state with the selected version number.
3. Show an info banner: "Starting from v{N} — describe what to change below."
4. User types change instructions in the existing `context` textarea.
5. On submit, `flowProposalsApi.requestFlowDesign(ticketId, { context, basedOnVersion })` is called.

This reuses the existing request form — no new form is needed. Only state management is added.

### 3.2 — `flowProposalsApi` — pass `basedOnVersion`

File: `packages/web-frontend/src/app/pages/tickets/flowProposalsApi.ts`

The `requestFlowDesign` function already accepts `context?: string`. Extend its signature to also accept `basedOnVersion?: number` and include it in the POST body.

### 3.3 — Clear fork context on cancel

Add a "Cancel fork" link next to the info banner that resets `basedOnVersion` to `undefined` and clears the banner.

### 3.4 — LLM behaviour (no code change needed)

`FlowDesignerAgent.designFlow()` already accepts `previousProposal` with `proposedFlowYaml`, `reasoning`, and `reviewThreads`. When `basedOnVersion` is set, `FlowProposalsService.requestFlowDesign` will pass the old proposal as `previousProposal` and the user `context` as change instructions — the prompt already handles this path (used by rejection redesign). No agent changes required.

### Files changed (Phase 3)

| File                                                                       | Change                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------- |
| `packages/web-frontend/src/app/pages/tickets/flowProposalsApi.ts`          | Add `basedOnVersion?: number` to `requestFlowDesign`      |
| `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`      | Fork state, info banner, pass `basedOnVersion` to handler |
| `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.test.tsx` | Test fork-from-version flow                               |

### Risk areas (Phase 3)

- If there is already a `pending_review` proposal, the "Request a new design" form is hidden (current behaviour: form only shown when `currentProposal.status !== 'pending_review'`). The fork button should be disabled / show a tooltip "Cannot fork while a proposal is pending review."
- The `basedOnVersion` state must be reset when the ticketId changes (already safe if the component unmounts, but add explicit reset in the `useEffect` cleanup).
- The fork info banner must be visually distinct enough that users understand they are branching from an old version, not just requesting a fresh design.

---

## Implementation Order

1. **Phase 1** (backend) — small, self-contained, can be done independently.
2. **Phase 2** (frontend, history display) — purely additive, no backend dependency beyond what already exists.
3. **Phase 3** (frontend, fork action) — depends on Phase 1 (backend `basedOnVersion`) and Phase 2 (history entry with "Fork" button).

Phases 2 and 3 frontend work must be delegated to the `frontend-dev` sub-agent per project rules.

---

## Test Strategy

### Backend (Phase 1)

- `FlowProposalsService.test.ts`: add test case `requestFlowDesign with basedOnVersion`:
    - Setup: ticket with proposals v1 (rejected) and v2 (pending_review) already in repo.
    - Call `requestFlowDesign(ticketId, 'change X', basedOnVersion: 1)`.
    - Assert `FlowDesignerAgent.designFlow` was called with `previousProposal` populated from v1.
    - Assert returned proposal is version 3.
- Add test for unknown `basedOnVersion` → throws `BadRequestException`.

### Frontend (Phase 2)

- `useFlowProposals.test.ts`: assert `historyProposals` = `proposals.slice(1)` with mocked API returning 3 proposals.
- `FlowProposalSection.test.tsx`:
    - Render with 3 proposals; assert history section is visible with "Version history (2)" label.
    - Toggle expand on v1 entry; assert YAML `<pre>` appears.
    - With only 1 proposal; assert history section is absent.

### Frontend (Phase 3)

- `FlowProposalSection.test.tsx`:
    - Click "Fork from v1"; assert info banner appears and `basedOnVersion` is set.
    - Submit form; assert `flowProposalsApi.requestFlowDesign` was called with `{ basedOnVersion: 1, context: '...' }`.
    - Click "Cancel fork"; assert banner disappears and `basedOnVersion` is cleared.
    - With `pending_review` current proposal; assert Fork button is disabled.

---

## Summary Table

| Phase                     | Complexity | Backend files                        | Frontend files                               | Blocking dependency |
| ------------------------- | ---------- | ------------------------------------ | -------------------------------------------- | ------------------- |
| 1 — Backend fork endpoint | S          | contract.ts, FlowProposalsService.ts | —                                            | none                |
| 2 — History timeline UI   | M          | —                                    | useFlowProposals.ts, FlowProposalSection.tsx | none                |
| 3 — Fork action UI        | M          | —                                    | flowProposalsApi.ts, FlowProposalSection.tsx | Phase 1 + Phase 2   |

Total estimated effort: ~1 day backend + ~1.5 days frontend.
