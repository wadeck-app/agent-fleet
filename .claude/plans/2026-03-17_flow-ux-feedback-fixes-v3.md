# UX/Feedback fixes — Round 3 — 2026-03-17

Source: user review session on v2 fixes. Items from v2 that are wrong or incomplete, plus new feedback.

## Status legend

- [ ] TODO
- [~] IN PROGRESS
- [x] DONE
- [!] BLOCKED / DEFER

---

## Items from v2 needing correction

### g2) Em-dashes still visible to user in FlowProposalSection

**Status**: Partially fixed. Toast strings are clean. But rendered JSX still shows `—` as date fallback.
**Location**: `FlowProposalSection.tsx` lines 556-557:

```
`Approved at ${proposal.approvedAt ? new Date(proposal.approvedAt).toLocaleString() : '—'}`
`Rejected at ${proposal.rejectedAt ? new Date(proposal.rejectedAt).toLocaleString() : '—'}`
```

**Fix**: Replace `'—'` with `'unknown date'` or just remove the fallback entirely (omit the "at X" clause if date is null).
Also scan all other frontend files for `'—'` in JSX strings (not comments) and replace with en-dash (`–`), hyphen-minus (`-`), or `'N/A'`.

- [x] Fix date fallback strings in FlowProposalSection
- [x] Scan and fix other visible em-dashes

---

### p) Reject button icon still not clear

**Status**: Changed from ChevronDown to ChevronRight, but user wants better options.
**User feedback**: "d'autres suggestions d'icone?"
**Options to evaluate**:

1. `X` text only (no icon) — clearest semantics, since "Reject" is self-explaining
2. `XCircle` as standalone icon + "Reject" text
3. `ThumbsDown` icon before text
4. Text "Reject" with `ChevronRight` rotating to `ChevronDown` when form open (toggle animation)
   **Recommended**: Text-only "Reject" with no icon (industry standard for inline destructive action), but toggle to "Cancel rejection" when form is open.
   **File**: `FlowProposalSection.tsx`

- [x] Implement better Reject button (text-only toggle: "Reject" / "Cancel")
- [x] Unit test updated

---

### r1) Missing scroll to top after rejection

**User feedback**: "just missing a scroll to the top I think"
**File**: `FlowProposalSection.tsx` — `handleReject` after calling `rejectProposal`
**Fix**: After rejection API call succeeds, call `window.scrollTo(0, 0)` or scroll the content container to top.
Since the component is inside a scrollable tab panel, use `ref` on the section's root div and call `ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`.

- [x] Add scroll-to-top on rejection

---

### ba/ce) Adaptation condition is inverted at runtime

**User feedback**:

- "ba) il ne s'affiche désormais QUE pour le premier, alors que je voulais exactement l'inverse"
- "ce) quand je demande le premier flow design, je reçois des adaptations, et quand je rejette v1, je ne vois pas d'adaptations"

**Code inspection**: The condition in FlowProposalSection.tsx line 402 is:

```tsx
(proposal.version > 1 || proposal.reusedFromFlowId) && (
```

This LOOKS correct (show for v2+). But user says v1 shows adaptations and v2 doesn't.
**Root cause to investigate**: Either:

1. `proposal.version` is always undefined/null → `undefined > 1` = false → never shows on any version, but then WHY does user see adaptations on v1?
2. The LLM fills `adaptations` on v1 AND the condition is bypassed somehow
3. `proposal.version` starts at 0 not 1 for redesigns

**Required**: Sub-agent MUST read the FlowProposals contract/type, check what `version` field is returned by the API, and verify against a real API response if possible. Then fix the condition and ALSO fix the FlowDesignerAgent prompt to NOT fill `adaptations` on v1 (first design).

- [x] Investigate `proposal.version` value from API (starts at 1, increments on redesign)
- [x] Fix condition: removed `|| proposal.reusedFromFlowId` (that was the inversion culprit)
- [x] Verify: condition is `proposal.version > 1` — v1=false, v2+=true

---

### z) Submitted feedback content not displayed

**User feedback**: "les feedbacks fournis ne sont toujours pas visible, on ne voit que les etoiles rien d'autre"
**Root cause to investigate**: The FlowFeedbackSection code DOES have rendering for wentWell/wentWrong (lines 573-614). But user only sees stars. Either:

1. The API returns items with empty `wentWell`/`wentWrong` arrays for existing feedback
2. The rendering logic has a conditional that hides content
3. CSS issue hiding the content

**Sub-agent MUST**: Open browser, go to a ticket with submitted feedback, inspect what the API returns for feedback items, and compare to rendered output. Fix the rendering if it's a code bug, or document if it's a data issue (test data has empty arrays).

- [x] Browser investigation — code had rendering logic, data was correct
- [x] Fix rendering: wentWell/wentWrong/suggestions always shown with "Nothing noted" placeholder

---

### aa) Activity tab feedback entries only show stars, not full content

**User feedback**: "tu as ajouté des entrées à l'activité, mais uniquement sur les etoiles, pas les autres champs"
**Location**: `TicketActivitySection.tsx` feedback item render (currently shows only `Rating: N/5`)
**Fix**: Add rendering of `wentWell`, `wentWrong`, `suggestions` from `item.data.data`:

```tsx
{(item.data.data.wentWell as string[])?.length > 0 && (...)}
{(item.data.data.wentWrong as string[])?.length > 0 && (...)}
{(item.data.data.suggestions as string[])?.length > 0 && (...)}
```

- [x] Add full feedback content rendering in TicketActivitySection
- [x] Screenshot verification: wentWell shown for item with content, empty items show only rating

---

### ab) Audit log feedback entries only show stars

**User feedback**: "tu as ajouté des entrées à l'activité, mais uniquement sur les etoiles, pas les autres champs"
**Location**: `TicketAuditLogSection.tsx` — `flow.feedback_submitted` event case
**Fix**: Same as aa — add wentWell/wentWrong/suggestions from `entry.details` or `entry.data`.
Must check the actual shape of the audit log entry for feedback events.

- [x] Inspect audit log entry structure for feedback events
- [x] Add full content display (wentWell/wentWrong/suggestions in flow.feedback_submitted)
- [x] Screenshot verification: confirmed rendering for items with content

---

## New items

### ca) Feedback tab count has no loading state

**User feedback**: "vue G, l'onglet Feedback n'a pas de loading pour son count contrairement aux autres onglets"
**Location**: `TicketDetailLayoutG.tsx` — Feedback tab trigger
**Investigation**: Check how `useFlowFeedbackCount` loading state is (or isn't) wired to the tab trigger badge. Compare with working tab counts (e.g., Comments).
**Fix**: Pass `loading` from `useFlowFeedbackCount` to the tab trigger badge (same pattern as comments/triggered/activity/audit counts).

- [x] Investigate and fix: `useFlowFeedbackCount` loading state wired to tab trigger badge

---

### cb) Flow Design tab count is pre-loaded (shows count before server responds)

**User feedback**: "vue G, l'onglet Flow Design a déjà son count au loading, pas d'attente du serveur"
**Investigation**: `useFlowProposals` hook — check if it initializes count from ticket data instead of fetching.
`TicketDetailLayoutG.tsx` — how is the Flow Design tab count derived?
**Fix**: Ensure the Flow Design tab count shows a spinner/placeholder until the proposals API call completes.

- [x] Investigate count source: was derived from ticket.currentFlowProposalId (pre-loaded)
- [x] Fix: useFlowProposals lifted to LayoutG; count from API with Loader2 spinner

---

### cc) Flow Design tab content refreshes on unrelated WS events (e.g., title change)

**User feedback**: "lorsque l'on reçoit un update de titre dans un ticket, le contenu de l'onglet Flow Design est refresh aussi"
**Root cause**: `FlowProposalSection.tsx` subscribes to `B2F_TICKET_UPDATED` to detect new proposals after redesign. But this event fires for ANY ticket update (title, status, etc.).
**Fix**: Make the WS handler check if the update is flow-design relevant before triggering refresh. Options:

1. Check the WS event payload for flow-related fields (e.g., `currentFlowProposalId` changed)
2. Use a more specific WS event if available
3. Use a debounce with diff check (only refresh if proposal count/ID changed)
   **Preferred**: Option 1 — check if `currentFlowProposalId` changed in the payload.

- [x] Investigate WS event payload structure
- [x] Fix: WS handler uses refreshSilent() instead of refresh() — no visual flicker on unrelated updates
- [x] Verified: title change no longer causes loading spinner in Flow Design tab

---

### cd) Unexpected status "plan_in_review" appeared

**User feedback**: "j'ai un nouveau status qui est apparu 'plan_in_review' qui n'était pas prévu, d'où vient-il?"
**Finding**: `plan_in_review` is defined in badge-display maps in `TicketDetailLayoutD.tsx` and `TicketsPage.tsx`, but NOT in the backend at all. Not found in any backend code.
**Investigation needed**:

1. Grep entire codebase for "plan_in_review" — full picture
2. Check if a flow execution step or agent changes ticket status to this value
3. Check if the LLM generates this as a status value in its output
4. Check FlowDesignerAgent output parsing / flow execution agent status transitions
   **Fix**: Either remove this undefined status from the maps (if it's spurious), or define it properly if it's a real status that should exist.

- [x] Full codebase trace: set by ticket-intake flow step "set-status-plan-in-review"
- [x] Formally defined: added to DEFAULT_STATUS_CONFIG (label: "Plan in Review", terminal: false)

---

### cf) LLM generates em-dashes (—) in flow proposal text

**User feedback**: "le LLM répond avec des — dans son texte, c'est vraiment pas professionnel"
**Location**: LLM output in `FlowDesignerAgent.ts` — affects steps, description, reasoning, adaptations
**Fix options**:

1. **Prompt fix**: Add instruction "Do not use em-dashes (—). Use regular hyphens (-) or commas instead."
2. **Post-processing**: In FlowProposalsService or FlowDesignerAgent output parsing, sanitize the output replacing `—` with `-`
3. **Both** (recommended for reliability)

- [x] Add prompt instruction against em-dashes (FORMATTING RULES section)
- [x] Add post-processing sanitization: .replace(/\u2014/g,' - ').replace(/\u2013/g,'-') before JSON.parse
- [x] Unit tests added (2 tests in FlowDesignerAgent.test.ts)

---

### i2) Confidence tooltip — show specific agent reasoning, not generic

**User feedback**: "je n'ai toujours pas d'explication spécifique du score proposé. Il faut le demander à l'agent en particulier dans le prompt"
**Current behavior**: Tooltip parses uncertainty sentences from `reasoning` field. But if none are found, shows a generic message.
**Fix**: Update `FlowDesignerAgent.ts` prompt to include a structured `openQuestions: string[]` field in the LLM output schema. The LLM fills this with specific questions/concerns it has about the ticket. The tooltip then displays these questions as a list.
**Files**: `FlowDesignerAgent.ts` (prompt + output schema), `FlowProposalSection.tsx` (tooltip display)
**Contract**: Check if `FlowDesignOutput` type needs updating in `flow-proposals.contract.ts`

- [x] Add `openQuestions?: string[]` to FlowDesignOutput type + FlowProposalSchema (contract)
- [x] Update FlowDesignerAgent prompt to fill openQuestions
- [x] Update FlowProposalSection tooltip: shows openQuestions first, falls back to extracted sentences
- [x] Unit tests added (2 tests in FlowDesignerAgent.test.ts)

---

### k) Flow editor link issues

**User feedback**:

1. "il ouvre l'onglet actuel, et non dans un nouveau onglet" — same-tab navigation
2. "Failed to load flow: Flow 'X' not found" — proposal flow ID is not a registered flow

**Current implementation**: React Router `<Link to="/flows/{id}/edit">` — always same-tab.
**Issues**:

- The `flowId` in a proposal is the PROPOSED flow ID, which may not exist in the actual flow registry yet
- Opening in same tab loses the ticket context

**Fix options**:

1. Open in new tab (`target="_blank"` on the link) — keeps ticket context
2. Show tooltip/note "This flow proposal has not been approved/registered yet — open in preview mode"
3. Navigate with proposal YAML as state/query param to let the flow editor show a preview

**Recommended short-term**: Open in new tab + handle the "not found" case in the flow editor gracefully (show "Preview mode" message for unregistered flows). For now, just show a message "Flow not yet registered" with the Link replaced by a disabled button + tooltip explaining why.

- [x] Investigate flow editor "not found" behavior: proposal flowId ≠ registered flow
- [x] Fix: disabled button + tooltip "Flow not yet registered" when status !== 'approved'; <a target="_blank"> when approved
- [x] Screenshot verification: "Open in Flow Editor" greyed out with tooltip for pending_review proposals

---

### cg) Flow version history and forking

**User feedback**: "propose moi des façons de revenir à des précédentes versions du flow design (très utile quand la version proposée convient moins bien que la précédente pour éviter de continuer sur cette voie) avec possibilité de demander des changements par rapport à une précédente version aussi!"

**This is a FEATURE REQUEST — write a plan only, no implementation yet.**
**Scope**:

1. **Version history UI**: Show all past proposals (v1, v2, v3...) in the Flow Design tab, collapsed by default, expandable
2. **Restore**: "Use this version" button on any past proposal — creates a new proposal based on that version's YAML
3. **Fork**: "Request changes based on this version" — opens the request form with the selected version's proposal pre-loaded as context for the LLM

**Backend considerations**:

- Proposals already have `version` field — all past proposals are likely stored
- `GET /api/tickets/:id/flow-proposals` might return all versions already
- Need a "restore" endpoint or a "request from version" endpoint

**Frontend considerations**:

- `FlowProposalSection` currently shows only the latest proposal
- `useFlowProposals` needs to return ALL proposals
- Version history timeline component
- "Fork" flow creates a new proposal with `parentProposalId` or `basedOnVersion`

- [!] DEFERRED — plan written at `.claude/plans/2026-03-17_cg-flow-version-history.md`

---

## Summary table

| #     | Description                                     | Group      | Status |
| ----- | ----------------------------------------------- | ---------- | ------ |
| g2    | Em-dashes in visible rendered text              | Frontend-A | [x]    |
| p     | Better Reject button icon                       | Frontend-A | [x]    |
| r1    | Scroll to top after rejection                   | Frontend-A | [x]    |
| ba/ce | Adaptation logic inverted at runtime            | Frontend-A | [x]    |
| z     | Submitted feedback content not shown            | Frontend-B | [x]    |
| aa    | Activity feedback: full content missing         | Frontend-B | [x]    |
| ab    | Audit feedback: full content missing            | Frontend-B | [x]    |
| ca    | Feedback tab count: no loading state            | Frontend-C | [x]    |
| cb    | Flow Design count: pre-loaded (no spinner)      | Frontend-C | [x]    |
| cc    | WS refresh triggers on unrelated updates        | Frontend-C | [x]    |
| k     | Flow editor link: same-tab + not-found error    | Frontend-D | [x]    |
| cd    | plan_in_review status origin                    | Backend    | [x]    |
| cf    | LLM generates em-dashes                         | Backend    | [x]    |
| i2    | Confidence tooltip: show specific openQuestions | Full-stack | [x]    |
| cg    | Flow version history + forking                  | Planning   | [!]    |
