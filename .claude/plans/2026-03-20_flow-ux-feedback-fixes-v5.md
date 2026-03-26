# Flow UX Feedback — Round 5 Plan

Date: 2026-03-20

---

## Root cause investigations (done before writing this plan)

### dl — Proposals not shown after new request

API for `w50c2nvuw` returns `[v2 approved, v1 pending_review, v1 rejected]`.
`currentProposal = proposals[0] = v2 approved` (sorted version DESC).
Root cause: `FlowProposalsService.requestFlowDesign` always hardcodes `version: 1`.
After a v2 approval + new request, the new proposal gets v1 again → sorts BELOW the approved v2.

### dj — Tab count updates, content doesn't refresh on new design

`B2F_FLOW_PROPOSAL_UPDATED` is only emitted by `triggerRedesignAsync` (after rejection).
`requestFlowDesign` (initial + post-approval requests) emits NOTHING.
`handleRequestDesign` calls `refresh()` manually after the HTTP response — works for content.
But the tab count (LayoutG `useFlowProposals` instance) never refreshes for non-async designs.
Fix: emit `B2F_FLOW_PROPOSAL_UPDATED` from `requestFlowDesign` in the backend.

### do — "Workspace must have a git strategy" validation error

`SchemaValidator.ts` line 153: strict validation. LLM occasionally omits `workspace.gitStrategy`.
**NOT related to temporary file preview** (b+cg was never implemented).
Root cause: LLM prompt doesn't enforce gitStrategy strongly enough.
Fix: (1) strengthen prompt, (2) add a sensible default fallback in `parseClaudeResponse`
if gitStrategy is missing (`'feature-branch'` as default).
User's proposed fix for b (preview): modal with flow blocks, not full editor redirect.

### dn — Triggered tab stays at 0 after worker-ai runs

`B2F_TASKS_UPDATED` broadcasts with empty payload `{}` (no ticketId filter).
`useTriggeredTasksCount` subscribes with no filter — fires on ANY task update globally.
Should work in theory. Likely issue: task created by orchestrator may not have `ticketId`
set, or the `B2F_TASKS_UPDATED` fires before the task is fully persisted with `ticketId`.

---

## Items — confirmed, no open questions

### da — Feedback tab does not respect sort order

**File:** `FlowFeedbackSection.tsx`
The `feedbackItems` array is not sorted by `submittedAt` before rendering.
Fix: accept `sortOrder: 'asc' | 'desc'` prop (from LayoutG, same as other tabs) and sort
`feedbackItems` by `submittedAt` before mapping to cards.

---

### db — Remove "Submitted / Feedback has been submitted" banner

**File:** `FlowFeedbackSection.tsx`
The green "Submitted" badge + "Feedback has been submitted for this ticket." text adds no
value when the list is shown below.
Fix: remove the banner entirely. Keep the "Add another feedback" button.

---

### dc — Collapse "Proposed flow" by default + reusable CollapsibleSection component

**Files:** `FlowProposalSection.tsx` + new `CollapsibleSection.tsx`

The "Reasoning" section is already collapsible. "Proposed flow" is always expanded and
takes all the screen real estate.

**Step 1 — Extract reusable component:**
Create `packages/web-frontend/src/app/pages/tickets/CollapsibleSection.tsx`:

```tsx
interface CollapsibleSectionProps {
	title: string;
	defaultOpen?: boolean;
	badge?: React.ReactNode; // e.g. question count
	children: React.ReactNode;
}
```

Renders: `<Button variant="ghost">` toggle with `ChevronRight`/`ChevronDown` + title + badge
in a bordered `<div>`. Animatable via CSS transition on height.

**Step 2 — Refactor Reasoning to use `CollapsibleSection`** (defaultOpen=false)
**Step 3 — Wrap "Proposed flow" YAML block in `CollapsibleSection`** (defaultOpen=false)
The "Open in Flow Editor" link stays in the section header (right side) even when collapsed.

---

### de — First Activity item missing vertical line

**File:** `TicketActivitySection.tsx`
The vertical connector `h-full w-px bg-border` is rendered only on items after the first
because the first item's icon column uses different CSS. Check if `h-full` works correctly
when the preceding container doesn't have an explicit height. Fix the CSS so all items
have a consistent vertical line under their icon column.

---

### df — WS event when feedback is added/modified/deleted

**File:** `packages/web-backend/src/services/FlowFeedbackService.ts`
Currently, only `B2F_TICKET_FEEDBACK_SUBMITTED` is emitted on submit. No events on
update/delete (which don't exist yet — see dd).
Also: `FlowFeedbackSection` currently fetches feedback on mount only. When another user
submits feedback, the current user's list doesn't update.
Fix: emit `B2F_TICKET_FEEDBACK_SUBMITTED` on every feedback mutation (create/update/delete).
`FlowFeedbackSection` and `useFlowFeedbackCount` already subscribe to this event.

---

### dg — Remove "Request new design" button next to approved flow header

**File:** `FlowProposalSection.tsx`
When a proposal is `approved`, a "Request new design" button appears in the proposal header
row (near the badge and confidence score). This button duplicates the form at the bottom
of the page and clicking it when a pending proposal already exists would create a conflict.
Fix: remove this button entirely. The form at the bottom is the sole entry point.

---

### di — "Request new design" form not blurred during loading

**File:** `FlowProposalSection.tsx`
When "Request new design" is clicked, the button shows a spinner but the textarea remains
editable. Other forms (feedback submit, status save) wrap content in
`pointer-events-none opacity-50` while saving.
Fix: wrap the request form content in `<div className={isRequesting ? 'opacity-50 pointer-events-none' : ''}>`.
Validate with `dev-hold` on `POST /api/tickets/:ticketId/flow-proposals/request`.

---

### dj — Tab content not refreshed when new proposal arrives

**Root cause:** `B2F_FLOW_PROPOSAL_UPDATED` not emitted from `requestFlowDesign`.
**Fix (backend):** `FlowProposalsService.requestFlowDesign` must emit
`B2F_FLOW_PROPOSAL_UPDATED` after creating the proposal (same as `triggerRedesignAsync`).
**Lessons learned (add to `.claude/kb/lessons-learned.md`):**

> WS events must be emitted for EVERY mutation that changes data displayed in the UI.
> When adding a new feature that creates/updates/deletes entities, always check: which
> hooks subscribe to which events? If no hook covers the new mutation, either add the event
> emission in the backend service OR add a manual refresh after the HTTP response returns.
> Pattern: `requestFlowDesign` (sync) was missing `B2F_FLOW_PROPOSAL_UPDATED` → tab count
> updated via manual refresh, but content of LayoutG count hook never refreshed.

---

### dl — Proposals not shown after new post-approval request

**Two fixes required:**

**Fix 1 — Backend: version numbering**
`FlowProposalsService.requestFlowDesign` always sets `version: 1`.
Change to: `const maxVersion = existing.reduce((m, p) => Math.max(m, p.version), 0)` then
`version: maxVersion + 1`.

**Fix 2 — Backend: sort by proposedAt DESC**
`FlowProposalsRepository.findByTicketId` sorts by version DESC. After fixing version
numbering, the newest proposal will have the highest version and will sort first.
Verify sort is `proposedAt DESC` as tiebreaker.

---

### dm — Feedback tab disabled still shows no count

**File:** `TicketDetailLayoutG.tsx`
When `!ticket.currentFlowProposalId`, the Feedback tab is `[disabled]` with no count badge.
The `useFlowFeedbackCount` already returns `count: 0, loading: false` when `flowId` is null.
Fix: always render the Feedback tab trigger with `<TabCountBadge>` — the disabled state
can coexist with the `(0)` badge. Keep the tooltip "Request a flow design first".

---

### do — Validation error + preview modal instead of full editor

**Two separate fixes:**

**Fix 1 — Prompt hardening (backend, `FlowDesignerAgent.ts`)**
The LLM occasionally omits `workspace.gitStrategy`. Add explicit instruction in the
FORMATTING RULES section:

```
- workspace.gitStrategy is REQUIRED: use one of main-only | feature-branch | any | worktree
```

Also add a post-processing fallback in `parseClaudeResponse`: if `proposedFlow.workspace`
exists but `gitStrategy` is absent, set `gitStrategy: 'feature-branch'` before validation.

**Fix 2 — Preview modal: "Visualize" button on pending proposals**
Replace the disabled "Open in Flow Editor" button on non-approved proposals with a
"Visualize" button that opens a **modal** showing the flow steps as cards.
Modal content: a simple list of step cards (icon, step id, type, name, description).
NO full ReactFlow canvas, NO temp file writing to disk.
Implementation: read `proposal.proposedFlow` directly from the proposal object (already in
the frontend), render step cards in a `<Dialog>`. No backend API change needed.

---

## Items requiring answers before implementation

### dd — Update / delete feedback

**Need clarification:**

- Update: can the user change only the qualitative fields (wentWell/wentWrong/suggestions)
  and the rating? Or just one of them?
- Delete: permanently delete with confirmation dialog?
- After deletion, can the user submit new feedback for the same ticket?

**Provisional plan (adjust after answers):**

- Edit button on each feedback card → opens the card in inline edit mode
  (same form fields, pre-populated with existing values)
- Save → `PUT /api/flow-feedback/:feedbackId` (new backend endpoint)
- Delete button → confirmation dialog → `DELETE /api/flow-feedback/:feedbackId`
  (new backend endpoint)
- Backend emits `B2F_TICKET_FEEDBACK_SUBMITTED` on update/delete for live refresh

### dh — Label connectivity + label audit across the app

**Need clarification:**

- "Request a new flow design" label: does it refer to the `<Label>` element that wraps
  the optional context textarea below the heading? Or the heading text itself?
- The fix would associate a `<label htmlFor="context-input">` linked to the textarea `id`.
- Scope of the label audit: only the tickets module? Or all forms in the app?

---

## Implementation order

### Phase 1 — Backend (no frontend changes)

| Item | File(s)                                                 | Effort |
| ---- | ------------------------------------------------------- | ------ |
| dj   | `FlowProposalsService.ts`                               | XS     |
| dl   | `FlowProposalsService.ts`, `FlowProposalsRepository.ts` | S      |
| df   | `FlowFeedbackService.ts`                                | XS     |
| do-1 | `FlowDesignerAgent.ts`                                  | XS     |

### Phase 2 — Frontend simple fixes (delegate to frontend-dev)

| Item | File(s)                     | Effort |
| ---- | --------------------------- | ------ |
| da   | `FlowFeedbackSection.tsx`   | XS     |
| db   | `FlowFeedbackSection.tsx`   | XS     |
| de   | `TicketActivitySection.tsx` | XS     |
| dg   | `FlowProposalSection.tsx`   | XS     |
| di   | `FlowProposalSection.tsx`   | XS     |
| dm   | `TicketDetailLayoutG.tsx`   | XS     |

### Phase 3 — Frontend medium (delegate to frontend-dev)

| Item | File(s)                                                   | Effort |
| ---- | --------------------------------------------------------- | ------ |
| dc   | `CollapsibleSection.tsx` (new), `FlowProposalSection.tsx` | S      |
| do-2 | `FlowProposalSection.tsx` (visualize modal)               | S      |
| dn   | `useTriggeredTasksCount.ts`, investigate task ticketId    | S      |

### Phase 4 — After answers

| Item | File(s)                                          | Effort |
| ---- | ------------------------------------------------ | ------ |
| dd   | `FlowFeedbackSection.tsx`, new backend endpoints | M      |
| dh   | `FlowProposalSection.tsx` + audit all forms      | S      |

### All phases — run `npm run check` + validate with agent-browser and dev-hold

---

## Nouveaux items — 2026-03-20 feedback round 5b

### p-fix2 — "Confirm rejection" taille incohérente + "Cancel" mal positionné

**Fichier:** `FlowProposalSection.tsx`

- `size="sm"` sur "Confirm rejection" (ligne ~604) → trop petit par rapport à "Approve" (pas de size → default)
- "Cancel" devrait être dans le formulaire, à côté de "Confirm rejection", pas comme toggle du bouton Reject
- Layout cible :
    ```
    [Approve]  [Reject...]
    [Rejection reason textarea]
    [Confirm rejection]  [Cancel]
    ```
- Le toggle "Reject..." garde un label fixe (ne bascule plus vers "Cancel")

### c-fix2 — Labels questions non connectés aux textareas

**Fichier:** `FlowProposalSection.tsx`
Dans la section "Questions from the AI", chaque question est un `<p>` sans `htmlFor` et le
`<Textarea>` n'a pas d'`id`. Fix : `<Label htmlFor="question-{i}">` + `id="question-{i}"` sur chaque textarea.

### ea — Feedback tab (0) toujours absent [= dm, non implémenté]

Voir dm.

### eb — Markdown dans les commentaires de l'onglet Audit

**Fichier:** `TicketAuditLogSection.tsx`
Les entrées de type `ticket.comment_created` affichent le texte brut.
Fix : utiliser `<ReactMarkdown remarkPlugins={[remarkGfm]}>` pour le contenu des commentaires,
identique à `TicketCommentsSection.tsx`.

### ec — Boucle de retry sur validation LLM [CRITIQUE — backend]

**Fichier:** `packages/web-backend/src/agents/FlowDesignerAgent.ts`

**Problème constaté :** même description de ticket → parfois succès, parfois "Model step must
specify a model". Le LLM omet parfois le champ `model` sur les steps de type `model`, ou `gitStrategy`.
Ces erreurs sont corrigeables si on renvoie les erreurs au LLM.

**Fix partie 1 — Prompt :** Ajouter explicitement dans les rules :

```
- Steps of type "model" MUST include "model": one of sonnet | haiku | opus (REQUIRED, no default)
- workspace.gitStrategy is REQUIRED: main-only | feature-branch | any | worktree
```

**Fix partie 2 — Retry loop (max 2 retries) :**

```ts
const MAX_RETRIES = 2;
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
	const result = await this.callAndParseOnce(attempt === 0 ? mainPrompt : correctionPrompt(errors));
	const validation = this.registry.validateFlow(result.proposedFlow);
	if (validation.valid) {
		/* proceed */ break;
	}
	if (attempt === MAX_RETRIES) throw new Error(`...after ${MAX_RETRIES} retries: ${errors}`);
	errors = validation.issues
		.filter(e => e.severity === 'error')
		.map(i => `- ${i.message}`)
		.join('\n');
}
```

Correction prompt : "Your flow failed validation:\n{errors}\nReturn ONLY the corrected JSON."
Les évaluateurs s'exécutent après validation réussie uniquement (inchangé).

### ed — Pas de questions sur nouveau design [comportement attendu]

Le prompt FlowDesignerAgent spécifie : "Fill openQuestions ONLY when confidenceScore < 85."
Si le nouveau design a confiance ≥ 85 → aucune question. C'est normal.
**Aucune action requise.** Optionnel : afficher une note "No open questions (confidence ≥ 85%)".
