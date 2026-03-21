# Plan: Inline Comments UX for Flow Proposals

**Date:** 2026-03-19
**Status:** Draft
**Depends on:** cg plan (`2026-03-17_cg-flow-version-history.md`) for version history UI

---

## 1. Current State Analysis

### What exists today

- `FlowProposalSection.tsx` renders the YAML in a plain `<pre>` block:
  ```tsx
  <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono leading-relaxed">
    {proposalYaml}
  </pre>
  ```
  No line-number column, no hover state, no selection detection.

- `AddReviewThreadForm` is a separate form shown **below** the YAML that requires the
  user to manually type start/end line numbers into two `<Input type="number">` fields,
  then write their comment.

- `FlowReviewSelectorSchema` (`flow-proposals.contract.ts`) already has `startLine`,
  `endLine`, `startChar`, `endChar`, `selectedText` — the data model anticipates inline
  selection. Only the UI lags behind.

- `ReviewThreadItem` components are rendered after the YAML block, not alongside it.
  The only contextual hint is `Lines N–M` in mono text + a truncated `selectedText` snippet.

- `FlowReviewThread.status` supports `'open' | 'resolved' | 'stale'` — stale status is
  defined in the schema but never set by `FlowProposalsService`.

### What is clunky

1. **No spatial relationship** between a comment and the code it references. User must
   mentally map "Lines 5–8" back to the YAML block above.

2. **Manual line number entry** is error-prone. YAML dumps can reformat (key order,
   indent) differently between versions, making line numbers unstable and meaningless
   without seeing the YAML at the same time.

3. **Thread list is linear**, not anchored. Multiple threads on different parts of the
   YAML look identical until you read the line numbers.

4. **No visual indicator on the YAML** that a given line has comments.

5. **`stale` status is wired in the contract but never used.** When v2 is proposed,
   v1 threads are orphaned without any UX signal.

6. **The "Add review thread" button** only appears once, below all existing threads.
   For a long proposal the CTA is far from where the user is reading.

---

## 2. Proposed UX Design

### 2.1 Interaction model

The YAML block becomes an interactive annotated code view, inspired by GitHub PR reviews.

#### Annotated YAML renderer — `AnnotatedYamlViewer`

Replace the plain `<pre>` with a new component that renders each YAML line as an
individually addressable `<div>` row. Each row has:

- A **line number gutter** (left column, `w-10`, monospace, `text-muted-foreground`)
- A **comment indicator gutter** (right side of line number column): `MessageSquare`
  icon in amber if the line has open threads, `CheckCircle2` in muted for resolved
- The **line content** (right column, selectable text)
- A **`+` button** that appears on hover over the line (aligned right,
  `opacity-0 group-hover:opacity-100`), clicking it opens an inline comment form
  anchored below that line

#### Click-to-comment flow

1. User hovers a line → `+` button appears at the right edge of the row
2. User clicks `+` → an `InlineCommentForm` slides in immediately **below that row**
3. Form shows a `Textarea` with auto-focus and two buttons: "Add comment" / "Cancel"
4. On submit → `flowProposalsApi.createReviewThread` called with
   `selector: { startLine: n, endLine: n, selectedText: lineContent }`
5. On success → thread card appears inline, right below the line(s) it references

#### Multi-line selection

1. User clicks a line number to **anchor** the selection start (line background
   highlights in `accent/50`)
2. User shift-clicks another line to extend the selection (range highlights)
3. The `+` button becomes a "Comment on lines N–M" CTA at top-right of the range
4. Form opens inline at the end of the range; `selector.selectedText` is the
   concatenation of the selected lines

Keyboard shortcut: `Ctrl+Shift+C` (or `Cmd+Shift+C`) when lines are selected → open
comment form. `Escape` → cancel selection / close open form.

#### Inline thread display

After a thread is created (or on initial load), its card is rendered **inline between
lines** of the YAML:

```
Line 4   workspace:
           reusePolicy: always
Line 6   steps:       [MessageSquare icon]
── inline thread card ────────────────────────────────
  user  2026-03-19 14:22   "Why is reusePolicy always..."
  [Add reply]  [Resolve]
─────────────────────────────────────────────────────
Line 7     - id: fetch_data
```

Resolved threads are collapsed by default:
```
  ✓ Thread resolved (1 comment)  [Show]
```

### 2.2 Visual differentiation: open vs resolved vs stale

| State    | Line indicator       | Thread card                         |
|----------|----------------------|-------------------------------------|
| open     | Amber `MessageSquare`| Full card, amber left border        |
| resolved | Muted `CheckCircle2` | Collapsed grey card, "Show" toggle  |
| stale    | Muted `AlertCircle`  | Grey card, "Stale — from v{N}" chip |

### 2.3 Terminal proposal states

For `approved` or `rejected` proposals, comment forms are hidden (read-only YAML view).
Thread cards remain visible and expand/collapse normally — historical context preserved.
For superseded proposals (history panel from cg plan), threads show `stale` chips when
their referenced lines have changed in the newer version.

---

## 3. Technical Approach

### 3.1 New component: `AnnotatedYamlViewer`

**File:** `packages/web-frontend/src/app/pages/tickets/AnnotatedYamlViewer.tsx`

Props:
```ts
interface AnnotatedYamlViewerProps {
  yaml: string;
  threads: FlowReviewThread[];
  readOnly?: boolean;
  onCreateThread: (selector: FlowReviewSelector, comment: string) => Promise<void>;
  onAddReply: (threadId: string, content: string) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
}
```

Internal state:
```ts
const [hoveredLine, setHoveredLine] = useState<number | null>(null);
const [selectionStart, setSelectionStart] = useState<number | null>(null);
const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
const [openFormAtLine, setOpenFormAtLine] = useState<number | null>(null);
```

Implementation:
1. Split `yaml` by `\n` to get `lines: string[]`
2. Build a `Map<number, FlowReviewThread[]>` keyed by `thread.selector.endLine`
   (threads are injected below their last referenced line)
3. Render each line as a `<div key={i} className="group relative flex ...">` row
4. After each line `i`, inject thread cards if `threadsAtLine.get(i+1)` has entries
5. After line `selectionEnd` (when selection active), render `InlineCommentForm`

### 3.2 New component: `InlineCommentForm`

**File:** `packages/web-frontend/src/app/pages/tickets/InlineCommentForm.tsx`

Simple stateful form: textarea + submit/cancel buttons. Auto-focuses on mount.
`Ctrl/Cmd+Enter` submits. `Escape` cancels.

### 3.3 Modified: `ReviewThreadItem` → `InlineThreadCard`

Rename and adjust to render as a card that fits in the inline flow (left-border stripe
instead of outer border). Keep existing reply/resolve logic unchanged.

**File:** `packages/web-frontend/src/app/pages/tickets/InlineThreadCard.tsx`

### 3.4 Modified: `ProposalView` in `FlowProposalSection.tsx`

Replace:
```tsx
<pre className="...">
  {proposalYaml}
</pre>
```
with:
```tsx
<AnnotatedYamlViewer
  yaml={proposalYaml}
  threads={proposal.reviewThreads}
  readOnly={!isPendingReview}
  onCreateThread={handleCreateThread}
  onAddReply={handleAddReply}
  onResolve={handleResolveThread}
/>
```

Remove `AddReviewThreadForm`, the "Add review thread" button, and the separate thread
list section — all replaced by the inline `AnnotatedYamlViewer`.

### 3.5 Backend / contract changes

**No backend changes required for the core inline UX.** The existing
`FlowReviewSelectorSchema` already supports `startLine`, `endLine`, `selectedText`.

One optional contract improvement for the cg integration:

```ts
// flow-proposals.contract.ts
export const FlowReviewThreadSchema = z.object({
  // ... existing fields
  staleReason: z.string().optional(),   // e.g. "Lines 5-8 no longer exist in v3"
});
```

### 3.6 Keyboard shortcuts

| Shortcut             | Action                                   |
|----------------------|------------------------------------------|
| Click line number    | Start selection anchor                   |
| Shift+click line num | Extend selection                         |
| `Ctrl/Cmd+Shift+C`   | Open comment form for current selection  |
| `Escape`             | Cancel selection / close inline form     |
| `Ctrl/Cmd+Enter`     | Submit inline comment form               |

---

## 4. Integration with cg (Version History)

The cg plan proposes a `ProposalHistoryEntry` component showing collapsed past
proposals.

### Upgrade path

Replace the `<pre>` block in `ProposalHistoryEntry` with `<AnnotatedYamlViewer
readOnly={true} threads={historyProposal.reviewThreads} ...>`. This gives history
entries the same line-number gutter and thread indicators without allowing new comments.

### Thread staleness detection

When a new proposal version is created (via rejection redesign or forking),
`FlowProposalsService.triggerRedesignAsync` should mark existing open threads as
`stale` if the YAML has changed at those lines.

```ts
// FlowProposalsService.ts
private markStaleThreads(
  oldThreads: FlowReviewThread[],
  oldYaml: string,
  newYaml: string,
  newVersion: number
): FlowReviewThread[] {
  const oldLines = oldYaml.split('\n');
  const newLines = newYaml.split('\n');
  return oldThreads.map(thread => {
    if (thread.status !== 'open') return thread;
    const { startLine, endLine } = thread.selector;
    const oldSlice = oldLines.slice(startLine - 1, endLine).join('\n');
    const newSlice = newLines.slice(startLine - 1, endLine).join('\n');
    if (oldSlice !== newSlice) {
      return { ...thread, status: 'stale', staleReason: `Line content changed in v${newVersion}` };
    }
    return thread;
  });
}
```

Called in `triggerRedesignAsync` after the old proposal is updated to `rejected`,
before creating the new proposal. The new proposal starts with `reviewThreads: []`.

---

## 5. Integration with b (Flow Editor Preview)

**Recommendation:** Keep comments anchored to YAML lines only — not to graph nodes.

Reasons:
1. The YAML is the authoritative representation; the graph is derived
2. Adding graph-node-level comments would require a second selector type and dual
   rendering in both `AnnotatedYamlViewer` and the graph canvas
3. YAML line comments transfer across versions (with staleness detection); graph
   topology may change completely

If graph-node comments are desired later, the contract extension would be:
```ts
export const FlowReviewSelectorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('line'), startLine: z.number(), endLine: z.number(), selectedText: z.string().optional() }),
  z.object({ type: z.literal('node'), nodeId: z.string() }),
]);
```

---

## 6. Implementation Phases

### Phase 1 — `AnnotatedYamlViewer` core (read-only, no new comment UX)

**Complexity: M | Frontend only**

Tasks:
1. Create `AnnotatedYamlViewer.tsx` with `readOnly={true}` only — line numbers, gutter
   indicators, thread cards injected inline (collapsed resolved threads)
2. Create `InlineThreadCard.tsx` (read-only, refactored from `ReviewThreadItem`)
3. Replace `<pre>` in `ProposalView` with `<AnnotatedYamlViewer readOnly={true} ...>`
4. Keep existing `AddReviewThreadForm` and thread list as fallback (do not remove yet)
5. Tests: line rendering, thread injection at correct lines, resolved threads collapsed

Deliverable: YAML block shows line numbers + inline thread cards. No new comment UX yet.

### Phase 2 — Click-to-comment (single line)

**Complexity: M | Frontend only**

Tasks:
1. Add `onCreateThread` prop and `readOnly={false}` support to `AnnotatedYamlViewer`
2. Implement hover state and `+` button per line
3. Create `InlineCommentForm.tsx` with auto-focus, `Ctrl+Enter` submit, `Escape` cancel
4. Wire `openFormAtLine` state — form renders below the target line
5. Remove `AddReviewThreadForm` and the "Add review thread" button from `ProposalView`
6. Remove the separate thread list section (threads now inline)
7. Tests: click `+` on line 3 → form appears; submit → `createReviewThread` called
   with `selector.startLine === 3`

Deliverable: Full single-line inline comment flow. Old form removed.

### Phase 3 — Multi-line selection

**Complexity: S | Frontend only**

Tasks:
1. Add `selectionStart`/`selectionEnd` state to `AnnotatedYamlViewer`
2. Click line number gutter → set `selectionStart`; shift-click → set `selectionEnd`
3. Highlight selected range rows with `bg-accent/20`
4. Show "Comment on lines N–M" CTA button at right edge of last selected row
5. `selector.selectedText` = `lines.slice(start-1, end).join('\n')`
6. `Escape` clears selection; `Ctrl/Cmd+Shift+C` opens form for current selection
7. Tests: shift-click range → range highlighted; submit → correct `startLine`/`endLine`

### Phase 4 — Reply and resolve inline

**Complexity: S | Frontend only**

Tasks:
1. Add reply form toggle to `InlineThreadCard`
2. Add resolve button with optimistic update (collapse immediately, revert on error)
3. Wire `onAddReply` / `onResolve` callbacks through `AnnotatedYamlViewer`
4. Tests: resolve → card collapses; reply → comment count increments

### Phase 5 — Version history integration (depends on cg Phase 2 + Phase 1 above)

**Complexity: S | Frontend + Backend**

Tasks:
1. Replace `<pre>` in `ProposalHistoryEntry` (cg plan) with
   `<AnnotatedYamlViewer readOnly={true} threads={historyProposal.reviewThreads} ...>`
2. Backend: implement `markStaleThreads` in `FlowProposalsService.triggerRedesignAsync`
3. Contract: add `staleReason?: string` to `FlowReviewThreadSchema`
4. Tests: after redesign, threads at changed lines marked `stale`

---

## 7. Open Questions

**Q1 (Phase 2):** Should removal of `AddReviewThreadForm` be atomic with Phase 2, or
kept as fallback for one release?
> Recommendation: remove atomically — the new UX is strictly better.

**Q2 (Phase 3):** Multi-line selection via gutter-click or browser native text selection?
> Recommendation: gutter-click (click line number to anchor, shift-click to extend).
> Matches GitHub's model and avoids browser selection API complexity.

**Q3 (Phase 5):** Staleness check uses exact line content match — YAML reformatting
could produce false positives. Should we use:
  - (a) Exact string match (simple, false positives on reformat)
  - (b) Semantic YAML key/value comparison (accurate, complex)
> Recommendation: start with (a), note in stale chip "Line content changed in v{N}".

**Q4 (design):** Should resolved threads be hidden by default (GitHub-style) with a
"Show N resolved threads" toggle, or always visible in collapsed form?
> Recommendation: hidden by default, toggle to show.

---

## Summary Table

| Phase | Complexity | New files                                           | Modified files                              | Backend | Blocked by        |
|-------|------------|-----------------------------------------------------|---------------------------------------------|---------|-------------------|
| 1     | M          | `AnnotatedYamlViewer.tsx`, `InlineThreadCard.tsx`   | `FlowProposalSection.tsx`                   | No      | —                 |
| 2     | M          | `InlineCommentForm.tsx`                             | `FlowProposalSection.tsx`, `AnnotatedYamlViewer.tsx` | No | Phase 1      |
| 3     | S          | —                                                   | `AnnotatedYamlViewer.tsx`                   | No      | Phase 2           |
| 4     | S          | —                                                   | `InlineThreadCard.tsx`                      | No      | Phase 2           |
| 5     | S          | —                                                   | `FlowProposalSection.tsx`, `FlowProposalsService.ts`, `flow-proposals.contract.ts` | Yes | cg Phase 2 + Phase 1 |

All frontend work must be delegated to the `frontend-dev` sub-agent per project rules.

**Total estimated effort:** ~1 day backend (Phase 5) + ~3 days frontend (Phases 1–4).
