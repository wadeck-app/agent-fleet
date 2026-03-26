# Review Thread Edit & Delete

## Goal

Add delete and edit capabilities for review threads and their comments in the Flow Design tab (Layout G).

## New operations

| Method | Endpoint                                           | Description                                                 |
| ------ | -------------------------------------------------- | ----------------------------------------------------------- |
| DELETE | `.../review-threads/:threadId`                     | Delete thread + all its comments                            |
| DELETE | `.../review-threads/:threadId/comments/:commentId` | Delete a single comment (if last comment → delete thread)   |
| PATCH  | `.../review-threads/:threadId`                     | Extend existing: add optional `selector` field (edit lines) |
| PATCH  | `.../review-threads/:threadId/comments/:commentId` | Edit a comment's content                                    |

All operations work on threads of any status (open, resolved, stale).

## Backend changes

### 1. `packages/shared-frontend-backend/src/api/flow-proposals.contract.ts`

- Extend `UpdateReviewThreadSchema`: add optional `selector: FlowReviewSelectorSchema.optional()`
- Add `UpdateReviewCommentSchema = z.object({ content: z.string().min(1) })`
- Add routes to `FLOW_PROPOSALS_API_ROUTES`:
    - `DELETE .../review-threads/:threadId` → response: `z.object({ success: z.literal(true) })`
    - `DELETE .../review-threads/:threadId/comments/:commentId` → response: `z.object({ success: z.literal(true), threadDeleted: z.boolean() })`
    - `PATCH .../review-threads/:threadId/comments/:commentId` → body: `UpdateReviewCommentSchema`, response: `FlowReviewCommentSchema`

### 2. `packages/web-backend/src/services/FlowProposalsService.ts`

Add methods:

- `deleteThread(ticketId, proposalId, threadId)` — filter out thread from array, update proposal
- `deleteComment(ticketId, proposalId, threadId, commentId)` — if last comment → delete thread (return `{ threadDeleted: true }`); else remove comment
- `updateThread(ticketId, proposalId, threadId, data)` — extend `resolveThread` → rename to `updateThread`, handle both `status` and `selector` updates
- `updateComment(ticketId, proposalId, threadId, commentId, data)` — update comment content

### 3. `packages/web-backend/src/controllers/TicketsController.ts`

Wire up 4 new routes. Rename `resolveThread` call to `updateThread`.

### 4. Tests

Update `TicketsController.test.ts` and `FlowProposalsService.test.ts` for new routes/methods.

## Frontend changes

### `packages/web-frontend/src/app/pages/tickets/flowProposalsApi.ts`

Add:

- `deleteThread(ticketId, proposalId, threadId)`
- `deleteComment(ticketId, proposalId, threadId, commentId)`
- `updateThread(ticketId, proposalId, threadId, data: { selector? })` — reuse existing `resolveReviewThread` or keep separate
- `updateComment(ticketId, proposalId, threadId, commentId, data: { content })`

### `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

**ReviewThreadItem** — add:

- Delete thread button (trash icon, confirm via inline confirm or direct with undo toast)
- Edit thread button (pencil icon) → opens inline form with selector fields + first comment content editable
- Per-comment: delete button + edit button (pencil icon) → inline edit mode for content

**UX rules (per CLAUDE.md optimistic updates pattern):**

- Delete thread: mark thread `opacity-50 line-through` (pending) → on success remove from list → on error rollback + toast
- Delete comment: mark comment `opacity-50 line-through` (pending) → on success remove → on error rollback + toast
- Edit thread/comment: show edit form inline, on save → optimistic update → on error rollback + toast
