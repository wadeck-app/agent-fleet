# Ticket Comments V2

**Date:** 2026-03-01
**Branch:** ws2

---

## Context

`ticket-analyze-complexity` is working: fires on `ticket.created`, posts a Markdown comment.
The frontend renders those comments as raw text. This plan extends the comment system in 5 areas:

1. Render comments in Markdown (frontend, cosmetic)
2. Sort tickets by `updatedAt` descending (frontend, cosmetic)
3. User comment input form (frontend + existing API)
4. Worker reacts to user comments (new `ticket.comment_added` event + new flow)
5. Pass full comment history to the flow (fetched in script step)

Features 1–3 are independent frontend changes. Feature 4 depends on Feature 3.
Feature 5 is part of Feature 4's flow definition.

---

## Feature 1 — Render Comments in Markdown

### Prerequisite check

`react-markdown` and `remark-gfm` are **already present** in `packages/web-frontend/package.json`.
No install needed. Pattern established in `LogEntry.tsx` — use targeted Tailwind overrides, no
`@tailwindcss/typography` / `prose` classes.

### Change

**`packages/web-frontend/src/app/pages/tickets/TicketCommentsSection.tsx`**

Add imports:
```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
```

Replace the `<p className="whitespace-pre-wrap text-sm">` with:
```tsx
<div className="text-sm [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.content}</ReactMarkdown>
</div>
```

### Verification
- Create a ticket, wait for `ticket-analyze-complexity` to post — `**bold**` and `- bullet` render as HTML

---

## Feature 2 — Ticket List Sorted by Most Recently Updated

### Change

**`packages/web-frontend/src/app/pages/tickets/TicketsPage.tsx`**

In the `useEffect` that syncs `tickets → localTickets`, sort before setting:
```typescript
useEffect(() => {
    if (!loading) {
        const sorted = [...tickets].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setLocalTickets(sorted);
    }
}, [tickets, loading]);
```

**Risk R1:** After drag-and-drop + background refresh the list re-snaps to recency order.
The `order` float is persisted correctly — only the visual position regresses. Accept for now.

### Verification
- Create ticket A then B, then update A → A appears first on reload

---

## Feature 3 — User Comment Input Form

### Changes

**`packages/web-frontend/src/app/pages/tickets/tickets.api.ts`**

Add `addComment` method:
```typescript
addComment: (ticketId: string, body: CreateTicketComment): Promise<TicketComment> =>
    typedFetch('POST', '/api/tickets/:ticketId/comments', { params: { ticketId }, body }),
```

**`packages/web-frontend/src/app/pages/tickets/TicketCommentsSection.tsx`**

- Add state: `commentText`, `isSending`, `sendError`
- Add `Button` import from `@framework/components/primitives/Button`
- Add handler `handleSendComment` — calls `ticketsApi.addComment(ticketId, { content, author: 'user' })`, clears text on success (real-time append via `B2F_TICKET_COMMENT_ADDED` already wired)
- Remove early-return for empty comments — always show the form
- Add a textarea + "Send" button below the comments list

**Risk R2:** Worker will loop if `author` filter is not enforced correctly — see Feature 4.

### Verification
- Comment form visible on all ticket detail pages
- Posting a comment: appears immediately (via real-time event)
- Empty textarea → Send button disabled

---

## Feature 4 — Worker Reacts to New User Comments

### 4a. `EventBus.ts` — add `ticket.comment_added`

**`packages/web-backend/src/events/EventBus.ts`**

Add payload interface:
```typescript
export interface TicketCommentAddedPayload {
    ticketId: string;
    projectId: string;
    commentId: string;
    author: string;
}
```

Add to `InternalEventMap`:
```typescript
'ticket.comment_added': TicketCommentAddedPayload;
```

### 4b. `TicketsService.ts` — emit on `addComment()`

```typescript
async addComment(ticketId: string, data: CreateTicketComment): Promise<TicketComment> {
    const ticket = await this.getTicketById(ticketId);
    const comment = await this.ticketsRepository.addComment(ticketId, data);
    this.eventBroadcaster.broadcast(B2F_TICKET_COMMENT_ADDED, comment);
    this.eventBus?.emit('ticket.comment_added', {
        ticketId,
        projectId: ticket.projectId,
        commentId: comment.id,
        author: data.author ?? '',
    });
    return comment;
}
```

Note: `eventBus` is optional on `TicketsService` (injected only when orchestrator integration is
active). Check constructor signature to confirm optional injection is already wired — if not,
add it following the `ticket.created` pattern in `DataStoreFactory`.

### 4c. `DataStoreFactory.ts` — listener + `getBackendUrl()` helper

Extract the port calculation used in the `ticket.created` listener into a private helper
`getBackendUrl(): string` to avoid duplication.

Add listener after the `ticket.created` block:
```typescript
this.eventBus.on('ticket.comment_added', async payload => {
    const registry = this.orchestrator.getEventSubscriptionRegistry();
    const matches = registry.findMatching({
        event: 'ticket.comment_added',
        payload: { author: payload.author },
    });
    const backendUrl = this.getBackendUrl();
    for (const sub of matches) {
        const task = await this.orchestrator.getTaskManager().createTask(
            `ticket.comment_added: ${payload.ticketId}`,
            { flowId: sub.flowId, projectId: payload.projectId, ticketId: payload.ticketId },
            { ticketId: payload.ticketId, commentId: payload.commentId, author: payload.author, backendUrl }
        );
        this.orchestrator.getWorkerCoordinator().enqueueTask(task);
    }
});
```

### 4d. `flows.yml` — `ticket-comment-respond` flow

```yaml
ticket-comment-respond:
    version: '1.0.0'
    name: 'Respond to user comment'
    trigger:
        type: event
        event: ticket.comment_added
        filter:
            author: user
    steps:
        - type: script
          id: fetch-comments
          name: 'Fetch all ticket comments'
          env:
              TICKET_ID: '${{ inputs.ticketId }}'
              BACKEND_URL: '${{ inputs.backendUrl }}'
          script: node -e "fetch(process.env.BACKEND_URL+'/api/tickets/'+process.env.TICKET_ID+'/comments').then(r=>r.json()).then(d=>{process.stdout.write(JSON.stringify(d.comments));process.exit(0);}).catch(e=>{console.error(e.message);process.exit(1);})"
        - type: model
          id: respond
          name: 'Generate response'
          depends: [fetch-comments]
          model: haiku
          prompt: |
              You are an AI assistant helping with a software ticket. A user just posted a comment.
              Read the conversation history and write a helpful, concise response.

              Ticket ID: ${{ inputs.ticketId }}

              Conversation history (JSON array of {author, content, createdAt}):
              ${{ steps.fetch-comments.outputs.stdout }}

              Respond to the user's latest message. Be direct. No greetings or sign-offs.
        - type: script
          id: post-reply
          name: 'Post reply as ticket comment'
          depends: [respond]
          env:
              TICKET_ID: '${{ inputs.ticketId }}'
              COMMENT: '${{ steps.respond.outputs.response }}'
              BACKEND_URL: '${{ inputs.backendUrl }}'
          script: node -e "const b=JSON.stringify({content:process.env.COMMENT,author:'worker-ai'});fetch(process.env.BACKEND_URL+'/api/tickets/'+process.env.TICKET_ID+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:b}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);})"
```

### Loop prevention (critical)

Filter `author: user` blocks `worker-ai` comments from triggering the flow.
`EventSubscriptionRegistry.matchesFilter()` uses `payload[key] !== value` — exact case match.
Frontend must post with `author: 'user'` (lowercase). Worker posts `author: 'worker-ai'` → no match.

---

## Feature 5 — Comments in Flow (Design Decision)

**Option A — Fetch in script step** ✅ Selected (see 4d above)

Pros: Simple `flowInputs`, fetches latest state at execution time, no race condition.
Cons: One extra HTTP call per run (negligible).

**Option B — Pass as JSON in `flowInputs`** ✗ Rejected

Race condition: `addComment` saves → emits → listener runs immediately → might not see the
new comment yet in storage. Also bloats task storage with potentially large JSON.

---

## Implementation Order

```
Step 1 — Frontend (frontend-dev agent, parallel with Step 2):
    TicketCommentsSection.tsx  → Features 1 + 3 (Markdown + form)
    TicketsPage.tsx            → Feature 2 (sort)
    tickets.api.ts             → addComment method

Step 2 — Backend event wiring (main agent, parallel with Step 1):
    EventBus.ts                → Feature 4a (new event type)
    TicketsService.ts          → Feature 4b (emit on addComment)
    DataStoreFactory.ts        → Feature 4c (listener)

Step 3 — Flow (after Step 2 compiles):
    flows.yml                  → Feature 4d (ticket-comment-respond)

Step 4 — Test all:
    npm run check
    npm run test:agent -- --exclude="E2E*"
    Browser end-to-end: post user comment → worker replies in real time
```

---

## Required Tests (70% min, 90% target)

| File | What to test |
|------|-------------|
| `TicketsService.test.ts` | `addComment` broadcasts `B2F_TICKET_COMMENT_ADDED` and emits `ticket.comment_added` with correct payload |
| `EventBus.test.ts` | `ticket.comment_added` listener fires with typed payload |
| `TicketCommentsSection.test.tsx` | Form renders; submit calls `addComment({ content, author: 'user' })`; button disabled when empty; button disabled while sending |
| `TicketsPage.test.tsx` | Tickets sorted by `updatedAt` desc after load |

---

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Drag-and-drop visual regression after sort | Accepted, comment in code |
| R2 | Infinite loop worker ↔ user | Filter `author: user` exact match — worker posts `worker-ai` |
| R3 | `prose` classes absent | Use targeted overrides as in `LogEntry.tsx` |
| R4 | Large comment threads → big stdout | Not a concern at current scale |
| R5 | `author` undefined → empty string | `'' !== 'user'` → no match, safe |
