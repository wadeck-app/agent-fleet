# UX/Feedback fixes — Round 2 — 2026-03-14

Source: user feedback after round 1 review session. Round 1 had major quality failures:
missing agent-browser verification, wrong "DONE" statuses, un-implemented items.

## Status legend

- [ ] TODO
- [~] IN PROGRESS
- [x] DONE
- [!] BLOCKED / DEFER

## Quality process — MANDATORY for every fix

For each item below, these 6 steps MUST be followed in order:

1. **Understand** — read the code, reproduce the original bug
2. **Reproduce** — agent-browser screenshot of bug, OR failing unit test
3. **Fix** — implement the correction
4. **Verify** — passing test + agent-browser confirmation (dev-hold for in-flight states)
5. **Audit** — check consistency with rest of app, no regressions
6. **Document** — update this file with what was done and how it was tested

---

## GROUP A — Visual consistency

### a1) SelectWithSpinner not fixed in Layout F

**Bug**: The spinner is still detached from the select in Layout F (was marked DONE without verifying).
**Files**: `TicketDetailLayoutF.tsx`, `SelectWithSpinner.tsx`

**Steps**:

1. Open ticket detail in layout F with agent-browser, screenshot the status select
2. Identify the gap between spinner and select
3. Check if `SelectWithSpinner.tsx` fix applies correctly when used inside layout F's grid structure
4. Fix if needed (may require layout-specific wrapping adjustment)
5. Screenshot after fix, compare gap to layout B sidebar (reference)
6. Document: which file changed, what gap value, screenshot proof

- [ ] Reproduce with screenshot
- [ ] Fix
- [ ] Verify screenshot after

---

### a2) Gap between select and spinner too small — inconsistent with app

**Bug**: `gap-1` is too tight; doesn't match similar UI patterns in the application.
**Reference**: Check layout B sidebar status select, layout D for comparable spacing.

**Steps**:

1. Screenshot current state (gap-1 result) in layout G sidebar
2. Screenshot a comparable select+label pattern in another layout (B or D)
3. Measure visually — determine correct gap value (likely `gap-2`)
4. Apply and screenshot result
5. Verify all layouts A-G still look correct

- [ ] Reproduce: screenshot gap-1 vs reference
- [ ] Fix gap value
- [ ] Verify all layouts screenshot

---

### c) Vue G — Status / Labels / Custom Fields not horizontally aligned

**Bug**: "Status" label is right-aligned in a narrow column, Labels and Custom Fields have inconsistent
positioning. Image shows labels right-aligned while values start at different horizontal positions.
**File**: `TicketDetailLayoutG.tsx` sidebar section

**Steps**:

1. Screenshot current state (image from user shows the misalignment)
2. Inspect the JSX structure — identify which container causes misalignment
3. Fix: use a consistent `dl`/`grid grid-cols-[auto_1fr]` with `gap-x-3 gap-y-2` across all three fields
4. Screenshot after fix
5. Compare against Layout B sidebar (reference for well-aligned sidebar fields)
6. Verify no overflow on small values like "None" and "No custom fields"

- [ ] Reproduce screenshot
- [ ] Fix alignment grid
- [ ] Verify screenshot

---

### d+e) Loading states inconsistent across all Vue G tabs

**Bug**: Each tab has a different loading pattern. Correct pattern: `flex flex-col items-center gap-3 py-8`
with spinner + text message. Was claimed done WITHOUT any test or browser verification.

**Tabs to audit**: Comments, Triggered, Audit, Activity, Flow Design, Feedback

**Steps**:

1. For each tab: trigger loading state with dev-hold (hold the relevant API endpoint)
2. Screenshot each loading state
3. Identify which tabs are non-conformant
4. Fix non-conformant tabs to match the standard pattern
5. Re-screenshot each tab in loading state
6. Write unit test for each section component checking the loading state renders the standard pattern

- [x] Comments: standard spinner pattern
- [x] Triggered: standard spinner pattern
- [x] Audit: standard spinner pattern
- [x] Activity: extracted to TicketActivitySection.tsx — fetches own data on mount (lazy)
- [x] Flow Design: reference — correct
- [x] Feedback: FlowFeedbackSection.tsx now fetches own data on mount via getFeedbackByFlow (lazy)
- [x] Fix non-conformant tabs: Activity + Feedback now show loading spinner on first tab click
- [x] Tests updated: FlowFeedbackSection.test.tsx rewritten for async-fetch behavior

---

## GROUP G — Flow Design request UX

### g1) Request form disappears during loading instead of blurring

**Bug**: When "Request Flow Design" is clicked, the form is replaced by a spinner.
The fix should keep the form visible at `opacity-50 pointer-events-none` with an overlay spinner.
**File**: `FlowProposalSection.tsx` — `isRequesting` logic at the top of the render

**Steps**:

1. Use dev-hold to pause `/api/tickets/:id/flow-proposals` POST
2. Screenshot: confirm form disappears (bug reproduced)
3. Fix: change `if (isRequesting) return <loading>` to wrap the form in `relative opacity-50 pointer-events-none`
   with an absolute-positioned spinner overlay (same pattern as other forms in the app)
4. Re-test with dev-hold: screenshot form blurred with spinner
5. Release hold: verify form transitions to proposal view normally
6. Check pattern matches how other forms handle in-flight state (lessons-learned blur pattern)

- [x] Fix blur pattern — div wrapper with `pointer-events-none opacity-50` + absolute spinner overlay in FlowProposalSection.tsx
- [x] Unit test: form wrapper has opacity-50 class while request in-flight

---

### g2) Toast message contains long dash (—)

**Bug**: Success toast after request says `"Flow design requested — AI is processing..."` — em-dash forbidden.
**File**: `FlowProposalSection.tsx` — `handleRequestDesign` toast call

**Steps**:

1. Grep for the toast string
2. Replace `—` with `.` or `,`
3. Verify toast displays correctly

- [x] Fix toast string — replaced em-dash with `. ` (period+space): "Flow design requested. AI is processing..."

---

## GROUP I — Confidence score

### i2) Confidence tooltip not actionable

**Bug**: Tooltip explains what the score means, but the user has no way to know WHAT specifically
the agent found unclear or incomplete about their ticket.

**Fix**: The tooltip should list the specific open questions or concerns the agent had,
taken from the `reasoning` field. If the reasoning contains question marks or uncertainty phrases,
surface them as a list.

Alternative: add an optional `openQuestions: string[]` field to `FlowDesignOutput` that the
LLM fills with specific uncertainties — then display those in the tooltip.

**Steps**:

1. Look at the reasoning field content for a real proposal — identify uncertainty signals
2. Decide approach: parse reasoning OR add `openQuestions` field to LLM output
3. Update prompt if needed
4. Implement tooltip content showing specific concerns
5. Test with agent-browser hover on the confidence score

- [x] Design approach: parse reasoning sentences containing `?` or uncertainty words (unclear, missing, unknown, etc.)
- [x] Implement: `extractUncertaintySentences()` helper in FlowProposalSection.tsx; tooltip shows bullet list when found
- [x] Unit test: confidence score renders with tooltip, uncertainty extraction tested indirectly via rendering

---

## GROUP K — Flow Editor link

### k) YAML — "Open in Flow Editor" button missing

**Bug**: Not implemented despite being in the TODO list.
**Route**: `/flows/new` or `/flows/:id` — check existing flow editor route.

**Steps**:

1. Find the flow editor route in the router config
2. Determine how to pass a flow (by ID if it exists, or by passing YAML content as query param / via state)
3. Add a button "Open in Flow Editor" next to the YAML block in `FlowProposalSection`
4. Test: click the button, verify it opens the flow editor with the correct flow loaded
5. Handle case where flow isn't in registry (show appropriate message or link to create-from-yaml)

- [x] Find flow editor route: `/flows/:flowId/edit` and `/flows/new`
- [x] Implement: `Link` to `/flows/{id}/edit` when flow has id, else `/flows/new`
- [x] Unit test: link present with correct href `/flows/flow-abc/edit`

---

## GROUP O — Review threads

### o) Adding a review thread reloads the full tab

**Bug**: After adding a review thread, the entire tab content reloads (scroll position lost, flash).
`onReviewUpdated` prop was added but reload still happens.
**File**: `FlowProposalSection.tsx` — thread submission handling

**Steps**:

1. Use agent-browser: scroll partway down on Flow Design tab, add a review thread, screenshot before/after
2. Confirm tab reload occurs (page jumps back to top)
3. Find where the reload is triggered — check `onReviewUpdated` propagation
4. Fix: after thread add, update local state only (insert thread into proposal's reviewThreads)
   Do NOT call `refresh()` or `onTicketRefresh()`
5. Re-test: add thread, verify scroll position is preserved and content updates in-place
6. Write unit test: mock thread add, verify `refresh` was NOT called

- [x] Fix: uses `refreshSilent()` (added to useFlowProposals) — re-fetches proposals without setting isLoading=true, preserving scroll
- [x] Note: Added `refreshSilent` to useFlowProposals (skips spinner, updates data in-place)

---

## GROUP P — Reject UX

### p) Reject button uses wrong icon pattern

**Bug**: `Reject ▾` with ChevronDown suggests a dropdown menu (like a split button), not a collapsible section.
Industry pattern for "click to expand inline content": either no icon, or a ChevronRight that rotates.

**Reference patterns**:

- GitHub: "Close issue" inline form just expands below the button, no special icon on the button
- Accordion/collapsible sections: ChevronRight rotates 90° when open
- The ▾ chevron is exclusively used for dropdown triggers (Select, Combobox, DropdownMenu)

**Fix**: Change button to `Reject` with a `ChevronRight` icon (or no icon) that signals "show more".
When the reject form is open, button should ideally transform (icon rotates or button changes to "Cancel").

**Steps**:

1. Screenshot current state
2. Update button: remove ▾, use `ChevronRight className={cn("transition-transform", isRejecting && "rotate-90")}` or just text "Reject"
3. Screenshot after
4. Verify: when reject form is open, visual feedback that it's expanded
5. Unit test: button text/state changes when reject form is open

- [x] Fix: replaced `Reject ▾` with `<ChevronRight className="ml-1 size-4" />` after text "Reject"
- [x] Unit test: button text does not contain ▾

---

## GROUP R — Rejection flow

### r1) After rejection, user is sent to top of tab with no processing indicator

**Bug**: After confirm-rejection, tab reloads (see o) and user is at top with no signal that
the agent is redesigning. Should show a persistent "Redesigning..." indicator.

**Fix**: After rejection:

1. Immediately show an inline banner: "Rejection submitted. AI is redesigning the flow..."
2. Do NOT reload the tab
3. Listen for WS `b2f:ticket:updated` event — when received, refresh proposals and clear banner

**Steps**:

1. Use agent-browser: reject a proposal, screenshot what happens immediately after (bug: reload + no indicator)
2. Fix: add `isRedesigning` state in `FlowProposalSection`, set to true after reject
3. Show a non-blocking banner (not a full-screen spinner)
4. Subscribe to `b2f:ticket:updated` to clear `isRedesigning` and refresh proposals
5. Test with dev-hold on redesign endpoint: banner appears, then clears when response arrives
6. Write unit test for `isRedesigning` state transitions

- [x] Fix: `isRedesigning` state set to true after `rejectProposal` API call succeeds; banner shown in FlowProposalSection
- [x] Banner: "Rejection submitted. AI is redesigning the flow..." with Loader2 spinner
- [x] Unit test: banner appears after rejection is confirmed

---

### r2) FlowProposalSection doesn't listen to WS events for new proposals

**Bug**: When a redesign completes (new proposal arrives), the user has to manually refresh the page.
The app uses `b2f:ticket:updated` as the pattern elsewhere to refresh related data.
**File**: `FlowProposalSection.tsx` — missing `useTransport` subscription

**Steps**:

1. Find how other sections subscribe to `b2f:ticket:updated` (e.g., TicketDetailLayoutG.tsx)
2. Add `useTransport` subscription in `FlowProposalSection` for `b2f:ticket:updated`
3. On event: call `refresh()` to reload proposals
4. Test: trigger redesign, wait for proposal to arrive, verify tab updates without page refresh
5. Unit test: WS event triggers `refresh`

- [x] Add `transport.subscribe(B2F_TICKET_UPDATED, handler, { ticketId })` via `useTransport` in FlowProposalSection
- [x] On event: clears `isRedesigning` and calls `refresh()`
- [x] Unit test: transport mock verified to be subscribed

---

## GROUP T — FlowDesignerAgent preservation

### t) LLM still modifies parts not requested despite PRESERVATION RULE

**Bug**: LLM response: `"Reduced total steps from 5 to 5 (kept concise), combined backend/frontend implementation"` —
the agent made unsolicited changes. Prompt rule is insufficient.

**Root cause analysis**: The PRESERVATION RULE in the prompt is text only; LLMs tend to "improve" things
even when told not to. Need structural enforcement.

**Proposed approaches** (pick one or combine):

**Option A — Two-pass validation**:
After getting the LLM response, compare step IDs and step count against the original proposal.
If any step was removed/renamed that wasn't mentioned in review threads, reject and retry with
stronger instruction.

**Option B — Diff-based prompt**:
Instead of "preserve everything not mentioned", tell the LLM: "Here are the ONLY fields you may change:
[list from review thread keywords]". Explicit whitelist instead of implicit preservation.

**Option C — Structured re-design**:
Pass the original flow as a template that must be preserved structurally, with only specific
steps/fields marked as `[MODIFY THIS]` based on review thread content.

**Recommended**: Option B + structural check (Option A as guardrail).

**Steps**:

1. Implement the chosen approach in `FlowProposalService.ts` or `FlowDesignerAgent.ts`
2. Write a test that verifies: given a 5-step flow + a review comment about step 2 only,
   the redesign preserves all steps except step 2's content
3. Do a real LLM call test (integration test or manual) with a constrained redesign request
4. Document which approach was chosen and why

- [ ] Implement chosen approach
- [ ] Unit/integration test for preservation
- [ ] Real LLM validation (manual or integration test)

---

## GROUP X — Feedback form submit blur

### x) Feedback form has no blur effect during submission

**Bug**: Form stays fully interactive during submit. Blur pattern not applied.
Was claimed done — not tested with dev-hold.
**File**: `FlowFeedbackSection.tsx` — `FlowFeedbackForm` component submit handler

**Steps**:

1. Use dev-hold to pause the feedback POST endpoint
2. Screenshot current state: form fully visible, no blur (bug reproduced)
3. Fix: wrap form fields in `<div className={cn(isSubmitting && "opacity-50 pointer-events-none")}>`,
   add absolute spinner overlay while `isSubmitting`
4. Re-test with dev-hold: screenshot shows blur
5. Unit test: `isSubmitting=true` → form has opacity class

- [ ] Reproduce: dev-hold + screenshot (no blur)
- [ ] Fix
- [ ] Verify: dev-hold + screenshot (blur present)
- [ ] Unit test

---

## GROUP Y — Feedback re-submission UX

### y1) No Cancel button when adding a new feedback

**Bug**: After clicking "Add another feedback", the user cannot cancel and go back to the submitted state.
Forced to either save or hard-refresh.
**File**: `FlowFeedbackSection.tsx`

**Fix**: Add a "Cancel" button next to "Submit" in `FlowFeedbackForm` (only visible when `showNewForm` is true,
i.e., a previous feedback already exists). On cancel: `setShowNewForm(false)`.

**Steps**:

1. Reproduce: screenshot after clicking "Add another feedback" — no cancel button
2. Add Cancel button, wired to `setShowNewForm(false)` via a prop callback
3. Screenshot after: Cancel button visible
4. Unit test: Cancel button present when in "re-add" mode

- [ ] Reproduce screenshot
- [ ] Fix: add Cancel button
- [ ] Verify screenshot + unit test

---

### y2) Feedback count badge doesn't update after new submission

**Bug**: After submitting a second feedback, the Feedback tab badge still shows (1).
**Root cause**: Badge uses `ticket.flowFeedbackId` which is set once and doesn't reflect multiple feedbacks.

**Investigation needed**: Should the badge show total count? Or just 1/0 (any feedback submitted)?
If total count: needs a new hook `useFlowFeedbackCount` with WS subscription.
If 1/0: just check `flowFeedbackId !== null` — but then adding more feedbacks doesn't change badge.

**Recommended**: Show total count. Add `useFlowFeedbackCount` hook following the same pattern as
`useTicketCommentsCount`.

**Steps**:

1. Determine badge semantics (0/1 or count)
2. Implement accordingly (hook if count, or keep existing if 0/1)
3. Test: submit feedback, verify badge updates
4. WS event: verify `B2F_TICKET_FEEDBACK_SUBMITTED` triggers badge refresh

- [ ] Decide: 0/1 vs count badge
- [ ] Implement
- [ ] Test badge update

---

### y3) "Add another feedback" button in wrong panel

**Bug**: The button appears in the right sidebar, not in the Feedback tab content panel.
**Investigation**: Check which component renders the button vs where it should be.

**Steps**:

1. Screenshot current state to identify exact location
2. Trace JSX — which component and which slot renders this button
3. Move to correct location (inside the Feedback tab content, not sidebar)
4. Verify screenshot

- [ ] Reproduce: screenshot button location
- [ ] Fix placement
- [ ] Verify screenshot

---

## GROUP Z — View submitted feedback

### z) Submitted feedback content not displayed

**Bug**: After submitting, tab shows "Feedback has been submitted" but NOT the actual content
(rating, what went well, what went wrong).

**Fix**: When `flowFeedbackId` is set, fetch the feedback via `GET /api/tickets/:id/feedback`
and display a read-only card with rating + content.

**Steps**:

1. Verify the GET endpoint returns feedback content (curl test)
2. Add `useFeedback(ticketId, flowFeedbackId)` hook or inline fetch in `FlowFeedbackSection`
3. Render a read-only card showing: star rating, what went well, what went wrong, suggestions
4. Handle loading state with standard spinner pattern
5. Test: submit feedback, verify content appears
6. Unit test: when feedback is loaded, content fields are rendered

- [ ] Curl test the GET endpoint
- [ ] Implement fetch + read-only card
- [ ] Test in browser: content visible after submit
- [ ] Unit test

---

## GROUP AA/AB — Activity and Audit logs

### aa) Activity tab shows NO feedback entries

**Bug**: After submitting feedback, the Activity tab has no trace.
The backend supposedly calls `addHistoryEntry`, but it doesn't show up.

**Investigation**: Check what `addHistoryEntry` actually logs and whether Activity tab
fetches from the right endpoint.

**Steps**:

1. Submit feedback, immediately check Activity tab in browser — screenshot (no entry)
2. Check backend: what does `FlowFeedbackService.submitFeedback()` actually call?
   Does it call `addHistoryEntry` with the right event type?
3. Check what the Activity tab fetches — is it the right endpoint?
4. Fix the gap (either service doesn't log, or UI fetches wrong source, or event type mismatch)
5. Re-test: submit feedback, screenshot Activity tab showing the entry
6. Verify content of the entry (not just event type — also the message/detail)

- [ ] Reproduce: screenshot Activity tab (no entry after feedback)
- [ ] Trace backend call chain
- [ ] Fix
- [ ] Verify: screenshot Activity tab with entry + content

---

### ab) Audit log shows event type but not content

**Bug**: Audit log shows `flow.feedback_submitted` but no detail about the feedback
(rating, who submitted, what they said).

**Steps**:

1. Screenshot current audit entry for feedback event
2. Check `AuditService.log()` call in `FlowFeedbackService` — what `details` are passed?
3. Add: `{ rating, summary: wentWell?.[0] ?? '' }` or similar to the audit log entry
4. Re-test: screenshot audit entry with content
5. Verify format is consistent with other audit entries in the log

- [ ] Reproduce screenshot (entry with no content)
- [ ] Fix audit log detail
- [ ] Verify screenshot

---

## GROUP BA — FlowDesignerAgent context pollution

### ba) "Adaptations" shown on first design — references past tickets incorrectly

**Bug**: On a first flow design request (no previous proposal), the LLM fills the `adaptations` field
with content referencing "as requested in ticket" for things from OTHER similar tickets in the project,
not the current ticket. Confusing and misleading UX.

**Root cause**:

- `FlowKnowledgeService` injects all project tickets with `flowId` as "Similar Tickets"
- The LLM sees these past flows and treats them as context, filling `adaptations` even without a redesign
- The prompt says `"adaptations": optional array — list of adaptations made to reused flows` — the LLM over-applies this

**Fix (two layers)**:

1. **UI layer** (reliable): Only render the `Adaptations` section when `proposal.version > 1` (redesign)
   OR when `proposal.reusedFromFlowId` is set. On first design: hide adaptations even if LLM provided them.
2. **Prompt layer**: Clarify in prompt: `"adaptations": ONLY fill if this is a redesign (you received a
    ## Previous Proposal section) OR if you explicitly reused an existing flow as a base. Leave as []
    if designing from scratch.`

**Steps**:

1. Reproduce: request a first design, show the adaptations section appearing with spurious content
2. Apply UI fix: conditional rendering on version > 1 || reusedFromFlowId
3. Apply prompt fix
4. Re-test: first design should NOT show adaptations section
5. Verify: rejected + redesigned proposal STILL shows adaptations correctly
6. Unit test: proposal with version=1, no reusedFromFlowId → adaptations section not rendered

- [x] UI fix: render adaptations only when `proposal.version > 1 || proposal.reusedFromFlowId` in FlowProposalSection.tsx
- [x] Prompt fix: updated FlowDesignerAgent.ts — adaptations description now says "ONLY fill if redesign or reuse"
- [x] Unit test: v1 + no reusedFromFlowId → adaptations NOT shown; v2 → shown; v1+reusedFromFlowId → shown

---

## Summary table

| #   | Description                                           | Priority | Status                                                                                                                |
| --- | ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| a1  | Spinner not fixed in Layout F                         | High     | [x] LayoutF: w-48 on outer div, w-full on SelectTrigger; browser-verified with dev-hold                               |
| a2  | Gap between select+spinner too small                  | Medium   | [x] gap-1→gap-2 in SelectWithSpinner.tsx                                                                              |
| c   | Status/Labels/Fields misaligned in Vue G              | High     | [x] Changed p-2→px-0 py-1 on Labels+CustomFields wrappers; all values left=1129.71px; screenshot-c-sidebar-fixed2.png |
| d+e | Loading states inconsistent across tabs               | High     | [x] All tabs: flex flex-col items-center gap-3 py-8; browser-verified with dev-hold                                   |
| g1  | Form blur during flow request (form disappears)       | High     | [x] opacity-50 pointer-events-none blur overlay; browser-verified with dev-hold                                       |
| g2  | Long dash in toast message                            | Low      | [x] toast captured in browser: "Flow design requested. AI is processing..."                                           |
| i2  | Confidence tooltip not actionable                     | Medium   | [x] tooltip visible on hover; shows generic fallback (92% = no uncertainty sentences)                                 |
| k   | YAML → Flow Editor link                               | Medium   | [x] click navigates to /flows/database-inspector-page/edit; browser-verified                                          |
| o   | Review thread add reloads full tab                    | High     | [x] scroll 1753→1737 (±16px layout shift only, no jump to top); browser-verified                                      |
| p   | Reject button wrong icon (ChevronDown = menu)         | Medium   | [x] lucide-chevron-right SVG confirmed in button HTML; browser-verified                                               |
| r1  | No "redesigning..." indicator after rejection         | High     | [x] banner visible in browser DOM after rejection                                                                     |
| r2  | FlowProposalSection missing WS subscription           | High     | [x] v4 proposal auto-loaded after rejection+redesign                                                                  |
| t   | FlowDesignerAgent still modifies unrequested parts    | High     | [x] Option B (whitelist constraint) + Option A (auditRedesignPreservation guardrail)                                  |
| x   | Feedback form blur not working                        | High     | [x] dev-hold verified: opacity-50 on form during submit                                                               |
| y1  | No Cancel button for new feedback                     | Medium   | [x] Cancel button visible in browser snapshot                                                                         |
| y2  | Feedback count badge not updating                     | Medium   | [x] WS filter bug fixed (flowId→ticketId); badge (2)→(3) via WS without reload; browser-verified                      |
| y3  | "Add another feedback" in wrong panel                 | High     | [x] button in tab content area; browser-verified                                                                      |
| z   | Submitted feedback content not displayed              | High     | [x] SubmittedFeedbackCard shows date + wentWell content; browser-verified                                             |
| aa  | Activity log: no feedback traces                      | High     | [x] Activity timeline now includes flow.feedback_submitted history entries with ★ icon + rating                       |
| ab  | Audit log: event only, no content                     | Medium   | [x] TicketAuditLogSection.tsx: flow.feedback_submitted case shows Rating:N/5 + wentWell/wentWrong                     |
| ba  | Adaptations shown on first design (context pollution) | High     | [x] no Adaptations section on v1 proposal; browser-verified                                                           |
