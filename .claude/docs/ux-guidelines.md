# UX/UI/Design Guidelines

Rules extracted from recurring user feedback across all conversations. Treat violations as bugs.

---

## 1. Consistency — CRITICAL

Everything visual must be uniform across the entire app: spacing, button sizes, typography, icon styles, loading patterns.

- Same padding tokens on equivalent containers across all pages
- Related action buttons must be the same size (e.g. Approve / Reject)
- Same icon style for similar actions
- Same loading pattern for all tabs/sections — one reusable component, not per-instance implementations

## 2. Component reuse — never inline, never custom — CRITICAL

**FORBIDDEN:** creating a custom component when a shared/primitive one already exists.

- Always use the existing primitive (`TabsWithUrlState`, `CrudDialog`, `FeedbackCard`, etc.)
- Each feature = a JSX tag. Adding/removing = adding/removing a tag
- Before writing any UI code, search for an existing component that covers the need

## 3. No UPPERCASE text — CRITICAL

Use sentence case everywhere: labels, headings, menu items, buttons.

- ✅ "Flow editor"
- ❌ "Flow Editor", "FLOW EDITOR"

## 4. No hover-only states — information always visible — CRITICAL

Buttons, controls, and information must be permanently visible. Never reveal something only on hover.

- ❌ Action buttons that appear on row hover
- ❌ Delete icons hidden until mouseover
- ❌ Contextual menus requiring hover to discover

## 5. Optimistic updates + blur effect on save — CRITICAL

When the user triggers a save/update:

1. Apply the change to the UI immediately (optimistic)
2. Show a blur/opacity effect on the element while the request is in flight
3. On error: revert and show error feedback
4. Use the `dev-hold` skill to capture and verify in-flight states

## 6. Every action must give visible feedback — CRITICAL

No silent operations. Every save / delete / approve / reject must produce a visible response.

- Success: toast, state change, or dialog close
- Error: inline message or toast
- In-flight: blur effect or spinner
- Dialogs must **close** after a successful save — never reopen

## 7. No surprises — predictable behavior — HIGH

The UI must behave exactly as the user expects.

- New entity auto-linked to current context (e.g. new workspace → current project)
- Forms don't reset unexpectedly
- No layout shifts after an action
- Modal closes on success, stays open on error (with the error visible)

## 8. Spacing & padding uniformity — HIGH

Use design tokens consistently. Never hardcode one-off values.

- Audit across all pages when changing spacing in one place
- Form field labels must have consistent distance from their inputs

## 9. Loading states — single consistent pattern — HIGH

- One reusable loading component for all tabs and sections
- Never show two spinners simultaneously
- Spinner must never overlap native controls (e.g. `<select>` arrow) — place it outside, disable the control
- Use skeleton screens instead of blank areas for content loading

## 10. Dialog scroll — native in Dialog.tsx, not per-instance — HIGH

Dialogs must scroll natively when content overflows. This behavior belongs in `Dialog.tsx` itself, not in individual dialog implementations (`CrudDialog`, etc.).

## 11. CSS scoping — className only in low-level components — HIGH

`className` and style props belong exclusively in base/primitive components. High-level wrappers must be style-agnostic.

- ❌ `className` on a page-level layout component
- ✅ `className` on `Button`, `Input`, `Badge`

## 12. Focus rings — never clipped — HIGH

Focus rings must always be fully visible. If a container has `overflow: hidden`, add padding to give the ring room.

## 13. Tooltips on badges and icon-only buttons — MEDIUM

Any badge or icon-only button must have a tooltip explaining its meaning.

## 14. Content loading — skeleton screens — MEDIUM

Never show a blank area while content loads. Use skeleton/placeholder components.

## 15. Dark mode completeness — MEDIUM

Every component must be tested and verified in both light and dark themes. Missing opacity or color overrides in dark mode are bugs.
