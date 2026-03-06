# Feedback Round 2 — sunny-imagining-tulip (2026-03-05)

## 1) Layout F loading states

Layout F shows too many loading spinners when the page loads. Not tested with agent-browser + dev-hold.
**Fix**: Investigate sources of concurrent loading states. Test with dev-hold screenshots.

## 2a) Ticket creation broken (title/description)

New ticket: description was "J'aimerai buildé une nouvelle page qui affiche l'heure du jour"

- Title became exactly: "J'aimerai buildé une nouvelle page qui affiche l'heure du jour" (copy of description — WRONG)
- Description became: "Analysis for J'aimerai buildé une nouvelle page qui affiche l'heure du jour" (WRONG)

**Expected**: title = AI-generated concise reformulation, description = original user text unchanged.
Root cause: `TicketsService.createFromPlan()` sets `description: plan.analysis` and the frontend
sends the description as-is when title is empty, instead of using plan.title.

## 2b) CommentPermalink too specific

`components/CommentPermalink.tsx` is not truly reusable — it knows about comments.
Should be split into:

- Generic primitive: `CopyLinkButton` (or `PermalinkButton`) — handles copy + URL logic
- Thin wrapper: `CommentPermalink` — constructs comment-specific URL

## 3) cursor-pointer audit incomplete

Only `SelectTrigger` was fixed. ALL interactive primitives must be audited:
Input, Checkbox, Switch, RadioGroup, Toggle, Button variants, etc.

## 4) Save button issues

Save button doesn't trigger `ticket.updated` event (no websocket reaction, no tasks, no audit log).
Also:

- (a) Dirty fields should have a visual blur/highlight effect so user knows what will be saved
- (b) Status change must NOT activate the Save button — status is handled autonomously (instant)
- (c) Need proper optimistic locking handling (version conflict → user-friendly error)

## 5) Status change UX

Status change appears instant for user but request hasn't been validated yet.

- Need to blur/disable the Select while the server request is in flight
- Need optimistic locking (version field)

## 6) ticket.updated not visible in frontend

`ticket.updated` event fires in backend but frontend shows nothing:

- No triggered task appearing in Triggered Tasks section
- No entry in Audit Log section
  Only half the work was done.

## 7) Event history section conceptually wrong

`TicketEventHistorySection` uses `tasksApi.getTasksList({ ticketId })` — this shows TASKS, not EVENTS.
Event history should track actual domain events: ticket.created, ticket.transitioned, ticket.comment_created...
regardless of how many tasks they spawned (could be 0, 1, or many).

## 8) Audit log too partial

Like Jira's history — should show actual data:

- "Changed status from Todo to In Progress"
- "Added comment: 'Can you elaborate?'"
- Actual field values before/after
  Not just "Comment added" without content.

## 9) Layout C tab counts inconsistent

Comments and Triggered tabs show element count, but History and Audit do not.
Must be consistent across all tabs in all layouts.

## 10) Flow script error still present (exit code 3221226505)

Task `93473548-fd67-4da9-8dfe-d3c933fb0edf` at step `post-acknowledgment-3` still fails.
**Requirement**: Write regression test FIRST (TDD), then fix, then verify.
The `node -e "..."` inline script fails on Windows with STATUS_STACK_BUFFER_OVERRUN.

## 11) Inverse links ticket → tasks

Currently: task shows "View ticket {id}" link.
Missing: ticket should show "View task {id}" links for triggered tasks.
(See also X3)

## 12) Loading states not tested

Loading states across the app still have issues. Must test each loading scenario with
agent-browser + dev-hold screenshots, not just assume they work.

## 13) ✅ Layout F send button FIXED

Confirmed: only one spinner, no extra text. Good.

## 14) ticket.updated flow not implemented

The Save button was added specifically to avoid per-keystroke triggers.
Each Save click = one `ticket.updated` event = one flow trigger.
Implement `ticket-updated-respond` flow in flows.yml.

---

## X1) ticket.comment_created must fire for ALL comments

Including worker-ai comments. The filter `!comment.author?.startsWith('worker-')` is WRONG.
Workers should be able to subscribe to each other's comments.
If loop prevention is needed, do it at the flow/worker level, not at the event emission level.

## X2) Triggered tasks display unprofessional

Screenshot #4 shows tasks/events in a messy way. Needs cohesive, clean visual design.

## X3) Triggered tasks should be clickable links

Better UX — render as links with proper href, not just text.
(See also #11)

## X4) Layout C tab counts show "0" during loading

Tabs show "0" then update to real count — this lies to the user.
Show "?" or nothing during loading, not "0".

## X5) Layout F AI assistant no scrollbar

Right panel has no height constraint — page expands infinitely with many messages.
Fix: proper height constraints + overflow-y-auto that actually works.
