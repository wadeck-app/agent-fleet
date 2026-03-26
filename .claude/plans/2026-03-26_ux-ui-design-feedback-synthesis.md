# UX/UI/Design Feedback Synthesis

> Extracted from ~139 JSONL conversation files across main, ws1, ws2, ws3 workspaces.
> Ranked by frequency + importance. Quotes are direct user messages.

---

## 1. Consistency — ⭐⭐⭐ CRITICAL | ~57 mentions across all workspaces

**Rule:** Everything visual must be consistent: spacing, typography, button sizes, colors, icon styles, loading patterns.

**Quotes:**
- "je deteste l'incoherence"
- "ca me saoule à mort"
- "Explore Dashboard, Workers, Tasks, Interventions, Workspaces pages to identify INCONSISTENCIES in their spacing"
- "donc maintenant toutes les implementations ont le même comportement ET le même rendu visuel c'est assuré ?"
- Button sizes: "Confirm rejection smaller than Approve — that's so weird and non professional"

**What triggers it:** Different paddings across pages, mismatched button sizes for related actions, different icon styles for similar buttons, tab loading patterns that differ between sections.

---

## 2. Component Reuse — no inline, no custom — ⭐⭐⭐ CRITICAL | ~31 mentions

**Rule:** NEVER create a custom component when a primitive/shared component exists. Always reuse.

**Quotes:**
- "C'est INTERDIT de faire du custom, tu dois utiliser les composants primitif de l'application"
- "réutiliser les composants plutôt que de faire du inline"
- "Chaque feature est un tag JSX. Ajouter/retirer = ajouter/retirer un tag"
- "Eliminate ~600 lines of duplicated code" (ProjectsV2 dialogs)

**What triggers it:** Creating a new tab component instead of `TabsWithUrlState`, inline form instead of `CrudDialog`, new icons instead of `FeedbackCard`, etc.

---

## 3. No UPPERCASE text — ⭐⭐⭐ CRITICAL | ~8+ mentions

**Rule:** Use sentence case everywhere. Never ALL CAPS in labels, headings, or menu items.

**Quotes:**
- "Move 'Flow Editor' to first menu group and rename to 'Flow editor' to be consistent"
- Consistent capitalization = sentence case, not title case or ALL CAPS

**What triggers it:** Menu items in Title Case, section headings in ALL CAPS, button labels in UPPERCASE.

---

## 4. Never hide information / no hover-only states — ⭐⭐⭐ CRITICAL | ~48 mentions

**Rule:** Buttons, controls, and information must always be visible. Never make something appear only on hover.

**Quotes:**
- "ne jamais cacher des informations, genre les boutons qui apparaissent qu'en hover"
- "ne pas cacher buttons"
- "Don't show/hide interactive elements"

**What triggers it:** Action buttons appearing only on row hover, delete icons hidden until mouseover, contextual menus requiring hover discovery.

---

## 5. Optimistic updates + blur effect during async save — ⭐⭐⭐ CRITICAL | ~10+ mentions

**Rule:** When saving/updating, immediately show the change (optimistic) and apply a blur/opacity effect while the request is in flight. On error, revert with feedback.

**Quotes:**
- "alors le champ après renommage est bien mais il n'y a pas d'effet de blur"
- "gestion optimistique des demandes serveurs avec effet de blur"
- "serait-il possible de faire ce traitement du titre en async, pour pas bloquer l'interaction utilisateur, et on mettrait comme titre '[pending...'"

**What triggers it:** Saving a field that locks the UI, no visual indicator during save, no blur on the element being saved.

---

## 6. Every action must give user feedback — ⭐⭐⭐ CRITICAL | ~13 mentions

**Rule:** Every user action (save, delete, approve, reject) must have a visible response: success state, error state, or loading indicator. No silent operations.

**Quotes:**
- "le feedback pour l'utilisateur que chaque action a un impact"
- Make async operations non-blocking with clear pending/loading indicators
- Dialog should close after successful update (not reopen)

**What triggers it:** Silent saves, modals that reopen after successful submission, no toast/confirmation after destructive actions.

---

## 7. No surprises — predictable UX — ⭐⭐ HIGH | ~13+ mentions

**Rule:** The UI must behave exactly as the user expects. No unexpected reopens, no state resets, no sudden layout shifts.

**Quotes:**
- "pourquoi quand j'update un workspace dans projects-v2, le workspace est mis à jour mais la modal se rouvre ?"
- "pourrais tu faire en sorte que lorsqu'un nouveau workspace est créé, il soit automatiquement lié au projet en cours ?"

**What triggers it:** Modal reopening after save, new entity not auto-linked to current context, form resetting unexpectedly.

---

## 8. Spacing & padding uniformity — ⭐⭐ HIGH | ~57 mentions

**Rule:** Consistent spacing tokens across ALL pages and components. Same padding for similar containers.

**Quotes:**
- "Pour optimiser l'espace" (ProjectsV2)
- "Padding p-4 removed from ScriptsPanel but needs consistent review"
- Form field names too close to editable content
- "Inconsistent label-to-field spacing (Labels has space, Custom Fields attached, Title/Description between)"

**What triggers it:** One page uses `p-4`, another `p-6`; labels aligned differently across forms; cards with different internal padding.

---

## 9. Loading states & spinners — ⭐⭐ HIGH | ~12+ mentions

**Rule:** Single, consistent loading pattern. No double spinners. Spinner must not overlap native controls (e.g., select arrow). Reuse the same loading component everywhere.

**Quotes:**
- "Double loading indicators showing simultaneously"
- "Spinner overlaps select dropdown arrow — solution: spinner outside select, select disabled during load"
- "Inconsistent patterns (some tabs use '?', others spinning icon)"
- "Need reusable component for all tabs"

**What triggers it:** Two spinners visible at once, spinner inside `<select>` element, different tab implementations using different loading indicators.

---

## 10. Dialog scroll behavior — native, not per-instance — ⭐⭐ HIGH | ~37 mentions

**Rule:** Dialogs must scroll natively when content overflows. This must be in `Dialog.tsx` itself, not in individual dialog implementations.

**Quotes:**
- "CreateTaskDialog has a scroll problem: when there are many dynamic flow input fields, the dialog exceeds screen height but has no scrollbar, blocking access to lower fields"
- "User wants scroll to be NATIVE in Dialog.tsx so ALL dialogs automatically have it"

**What triggers it:** Any dialog with many fields that gets cut off at the bottom.

---

## 11. CSS scoping — className only in low-level components — ⭐⭐ HIGH | ~6 mentions

**Rule:** `className` props and CSS should only appear in base/primitive components. High-level wrapper components must not carry styling.

**Quotes:**
- "dans le KanbanColumnWidget, il y a des className, alors que les class css sont expectée uniquement sur les composants de plus bas niveau"
- "should we forbid ALL usage of style attributes at all?"

**What triggers it:** High-level layout components with inline `className`, style attributes on composed components.

---

## 12. Focus rings — always visible, never clipped — ⭐⭐ HIGH | ~10+ mentions (ws2)

**Rule:** Focus rings must always be fully visible. Never hidden by `overflow: hidden` containers.

**Quotes:**
- Focus ring on left side claimed fixed 3×, still broken
- "tu ne sembles pas comprendre le problème"
- Fix: add `padding-left` to overflow container to give focus ring room

**What triggers it:** Input inside a container with `overflow: hidden`, focus ring getting cut on one side.

---

## 13. Tooltips on all badges and icon buttons — ⭐ MEDIUM | ~7 mentions

**Rule:** Any badge or icon-only button must have a tooltip explaining its meaning.

**Quotes:**
- "Add tooltips on badges in the projects-v2 page so users understand what each badge represents"
- "Tooltips should appear on hover for all badge types"

**What triggers it:** Colored badges without labels, icon buttons without accessible labels.

---

## 14. Information loading patterns — ⭐ MEDIUM | implied across many conversations

**Rule:** Content should load progressively with skeleton screens or placeholder states. Never show empty/blank areas.

**Quotes:**
- "la façon dont on charge les contenus"
- Use skeleton loaders, not blank white spaces or spinner-only pages

---

## 15. Dark mode completeness — ⭐ MEDIUM | ~10+ mentions (ws2)

**Rule:** Every UI element must work in both light and dark themes. No missing opacity or color overrides.

**Quotes:**
- "Dark theme opacity incomplete"
- All components must be tested in both themes

---

## Summary Table

| # | Principle | Frequency | Priority |
|---|-----------|-----------|----------|
| 1 | Consistency (spacing, sizes, patterns) | ~57 | CRITICAL |
| 2 | Component reuse — no inline/custom | ~31 | CRITICAL |
| 3 | No UPPERCASE text | ~8 | CRITICAL |
| 4 | No hover-only states / always visible | ~48 | CRITICAL |
| 5 | Optimistic update + blur on save | ~10 | CRITICAL |
| 6 | Every action has visible feedback | ~13 | CRITICAL |
| 7 | No surprises — predictable behavior | ~13 | HIGH |
| 8 | Spacing & padding uniformity | ~57 | HIGH |
| 9 | Single consistent loading/spinner | ~12 | HIGH |
| 10 | Dialog scroll native in Dialog.tsx | ~37 | HIGH |
| 11 | CSS scoping to low-level components | ~6 | HIGH |
| 12 | Focus rings never clipped | ~10 | HIGH |
| 13 | Tooltips on badges and icon buttons | ~7 | MEDIUM |
| 14 | Skeleton screens for loading content | implied | MEDIUM |
| 15 | Dark mode completeness | ~10 | MEDIUM |
