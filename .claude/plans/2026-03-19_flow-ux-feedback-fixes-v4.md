# Flow UX Feedback — Round 4 Plan

Date: 2026-03-19

---

## Confirmed bugs (can implement without questions)

### aa/ab — Feedback form loses typed content on submit

**Root cause (verified from code + API data):**
`ArrayFieldInput` only commits the typed draft to the list on **Enter key press**.
If the user types text and clicks "Submit Feedback" without pressing Enter, the draft state
is discarded and the submitted `wentWell`/`wentWrong`/`suggestions` arrays are empty.

The history entries confirm this: only the one submission where Enter was likely pressed has
`"wentWell": ["The flow design was comprehensive"]`. All others have empty arrays.

**Fix:** In `ArrayFieldInput`, commit the draft on `onBlur` (same logic as Enter).
Also relevant for `ab` (Audit) since the data is correctly stored — the rendering just
never sees non-empty arrays because the form was submitting empty.

---

### f — Flow Design and Feedback tab counts don't update via WS

**Root cause (verified):**

- `useFlowProposals(ticketId)` in LayoutG has NO WS subscription. When a redesign completes
  (B2F_FLOW_PROPOSAL_UPDATED fires), `FlowProposalSection` refreshes internally but the
  LayoutG count hook is a separate instance and never re-fetches. Count only updates on
  manual page refresh.
- `useFlowFeedbackCount` already subscribes to `B2F_TICKET_FEEDBACK_SUBMITTED` — so
  Feedback count IS reactive. But the issue may be that after a full page reload the count
  hook re-fetches correctly, but not after the WS event because the `flowId` passed to it
  is `ticket.currentFlowProposalId` which may not be the right key (see aa root cause:
  feedback is stored by proposalId as flowId, not the flow registry id).

**Fix:**

- Add `B2F_FLOW_PROPOSAL_UPDATED` subscription to `useFlowProposals` (mirrors pattern of
  `useTicketCommentsCount` which uses `useRealtimeRefresh`).
- Verify `useFlowFeedbackCount` actually receives the right `flowId` (proposalId).

---

### a / cb — (0) not displayed for empty Flow Design and Feedback tabs

**Root cause:**
`TabCountBadge` returns `null` when `count === 0`. This is consistent across all tabs, but
the user specifically notices it for Flow Design and Feedback because those tabs can
legitimately be empty (no proposals yet, no feedback yet) while comments/audit are never 0
in practice.

**Fix:** Always render the count in parentheses, even when 0, for all tabs.
Change `if (count === 0) return null` → always render `({count})`.
Result: `Comments (0)`, `Flow Design (0)`, etc. Consistent and honest.

---

### p — Reject button: icon request + style inconsistency

**Style inconsistency (verified from code):**

- "Reject"/"Cancel" button: `variant="outline"` + custom className for red border/text
- "Confirm rejection" button: `variant="destructive"` (solid red)
  These two buttons for the same action use different visual styles. Should be unified.

**Proposal:**

- "Reject" toggle button: `variant="destructive"` with `size="sm"` — clear, no ambiguity
- When open (showing "Cancel rejection"): `variant="outline"` with destructive color — same
  as current but consistent label
- "Confirm rejection": `variant="destructive"` `size="sm"` — unchanged, now matches the
  toggle style

**4 icon suggestions for the Reject button:**

1. `XCircle` — "cancel / invalidate" semantics, clean circular X
2. `ThumbsDown` — explicit rejection metaphor
3. `Ban` — strong "not allowed / blocked" metaphor
4. `AlertOctagon` — stop/danger signal

> **QUESTION p1:** Which icon do you prefer (1-4), or none?
> **QUESTION p2:** Should "Reject" and "Cancel rejection" share the same variant
> (`destructive` vs `outline+destructive`), or do you prefer to visually distinguish
> "this will reject" from "this cancels the rejection form"?

---

## Items requiring open questions before implementation

### k — "Open in Flow Editor" still 404 after approval

**What I know:**

- `approveProposal()` calls `registry.saveCustomFlow(proposal.proposedFlow)` which writes
  the flow to `flows-custom.yml`.
- The link opens `/flows/${proposedFlowId}/edit` in a new tab.
- The user tested URL: `http://localhost:5320/flows/storage-viewer-management-debugger/edit`
  which returned 404.

**What I don't know yet:** Whether the flow editor route `/flows/:id/edit` actually exists
in the frontend router, and whether it requires the flow to be fully loaded in the
registry before navigating.

**Proposed investigation:** Approve the current v4 proposal on `n6c1ou9in`, then check:

1. Does `flows-custom.yml` contain `database-inspector-page`?
2. Does `/flows/database-inspector-page/edit` work in the browser?
3. If yes → the issue was that the user tested with a non-approved proposal (all 4 are
   rejected/pending on that ticket). If no → there's a routing bug to fix.

> **QUESTION k:** Can you confirm: when you got the 404, was the proposal actually
> `approved` status in the UI (green badge), or was it pending/rejected? All proposals
> I can see for `n6c1ou9in` are rejected or pending — none approved.

---

### b — Open in Flow Editor BEFORE approval (preview mode)

**User request:** Be able to visualize the proposed flow in the editor before approving,
without committing to approval.

**Options:**

1. **Temp file approach:** Write a temp copy of the YAML to `flows-custom.yml` with a
   `_preview_` prefix on the ID, open editor, clean up on close. Risk: leaves orphan flows
   if user doesn't go back to close.
2. **Read-only viewer:** Add a separate read-only YAML viewer modal inline in the proposal
   section. Simpler but doesn't use the flow editor.
3. **Preview endpoint:** Backend writes a temp flow, returns a temp URL, frontend navigates
   to it. Clean but more backend work.

> **QUESTION b:** Do you want the full flow editor (editable, with the visual graph) or
> just a way to read the YAML in a larger/cleaner view? If full editor: option 1 or 3?

---

### c — openQuestions should be interactive (user can respond)

**User feedback:** Having open questions in a tooltip is "informative at best, mostly
frustrating." User wants to be able to respond to the questions, and those responses should
feed into the redesign request.

**Proposed design:**

- Replace tooltip with an inline "Questions from the AI" collapsible section (similar to
  Reasoning).
- Each question has a text input for the user's answer.
- On Reject: if there are unanswered open questions, pre-fill the rejection reason with the
  Q&A pairs, or include them as additional context in the redesign request.
- On "Request design": if open questions exist and are answered, pass them as `userContext`.

**Impact:**

- Frontend: new `OpenQuestionsSection` component with per-question text inputs
- Backend: pass answered questions as additional context to `FlowDesignerAgent`
- Contract: `RequestFlowDesign` needs a `questionsContext: {question: string, answer: string}[]` field

> **QUESTION c1:** Should the questions section be always visible (expanded by default) or
> collapsed by default like Reasoning?
> **QUESTION c2:** Should unanswered questions block rejection (require at least one answer),
> or are answers always optional?
> **QUESTION c3:** Should answered questions be shown in the rejection reason text, or passed
> as a separate field to the redesign request?

---

### d — Feedback form: optimistic/blurry rendering on submit

**User request:** After clicking "Submit Feedback", don't make the form disappear and
reappear — either keep it blurry until confirmed, or show the new card with a blurry
"pending" state immediately (optimistic rendering).

**Proposed design:**

- On submit: immediately render the new card in a blurred/pending state using the current
  form values (optimistic).
- When server confirms: remove blur, update with server response (adds `id`, `submittedAt`).
- On error: remove the optimistic card, restore the form with the entered values.

> **QUESTION d:** Preference between:
>
> 1. Form stays blurry while submitting (simpler, no optimistic card)
> 2. Optimistic card appears immediately, blurry until confirmed (better UX, more code)

---

### e — Confidence score instability / multi-agent evaluation

**User observation:** Confidence went from ~80% (with 4-5 open questions) to 95% after a
simple feedback that didn't address any of the open questions. The score feels arbitrary.

**Proposed fix:** Use 3 separate evaluator agents (or 3 separate Claude calls) to score:

1. **Completeness**: does the proposed flow cover all requirements from the ticket?
2. **Feasibility**: are the steps realistic given the available capabilities?
3. **Coherence**: is the flow internally consistent and logically sound?

Final confidence = average of the 3 scores (each 0-100). For v2+: add a 4th axis: 4. **Feedback coverage**: does the new proposal address the previous rejection feedback?

> **QUESTION e:** This is a significant backend change (~2-3 days). Should we implement
> it now or defer to a future sprint? If now: should all 3 evaluators use the same
> Claude model (haiku for speed), or a stronger model for accuracy?

---

### g — Flow design not shown in Triggered tab

**User question:** Is it expected that triggered flow designs are not listed in the
Triggered tab?

**My understanding:** The Triggered tab shows `Task` items (tasks created by flow
executions). A flow _design request_ is not a Task — it's handled synchronously by
`FlowDesignerAgent` within the HTTP request cycle, not as a background task. So it
correctly does not appear in Triggered.

**However**, if the user wants visibility of "flow design was requested / completed" as a
triggered item, we could add a synthetic entry. But that seems redundant with the Audit/
Activity tabs which already track `flow.design_requested` and `flow.proposed` events.

> **QUESTION g:** Do you want flow design requests to show up in the Triggered tab, or is
> the current behavior (visible in Audit/Activity) sufficient?

---

## Implementation plan (once questions answered)

### Phase 1 — No-question bugs (implement now)

| Item  | File(s)                   | Effort |
| ----- | ------------------------- | ------ |
| aa/ab | `FlowFeedbackSection.tsx` | XS     |
| f     | `useFlowProposals.ts`     | XS     |
| a     | `TicketDetailLayoutG.tsx` | XS     |

### Phase 2 — After p question answered

| Item | File(s)                   | Effort |
| ---- | ------------------------- | ------ |
| p    | `FlowProposalSection.tsx` | XS     |

### Phase 3 — After k question answered

| Item | File(s)                                    | Effort |
| ---- | ------------------------------------------ | ------ |
| k    | `FlowProposalSection.tsx`, possibly router | S      |

### Phase 4 — After b/c/d questions answered

| Item | File(s)                                                      | Effort |
| ---- | ------------------------------------------------------------ | ------ |
| b    | `FlowProposalSection.tsx`, `FlowProposalsService.ts`         | M      |
| c    | `FlowProposalSection.tsx`, `FlowDesignerAgent.ts`, contracts | M      |
| d    | `FlowFeedbackSection.tsx`                                    | S      |

### Phase 5 — Deferred or explicit go-ahead

| Item | File(s)                                      | Effort |
| ---- | -------------------------------------------- | ------ |
| e    | `FlowDesignerAgent.ts`, new evaluator agents | L      |
