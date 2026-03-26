# Audit Accessibilité : Connectivité Label/Input

**Date:** 2026-03-20
**Scope:** Toute l'application web-frontend
**Total issues:** 21 (2 HIGH + 16 MEDIUM + 3 LOW)

---

## Résumé

### Par sévérité

| Sévérité | Count | Description                                                   |
| -------- | ----- | ------------------------------------------------------------- |
| HIGH     | 2     | Composants réutilisables du framework — impactent toute l'app |
| MEDIUM   | 16    | Labels/inputs non connectés dans des formulaires actifs       |
| LOW      | 3     | Zones read-only ou patterns acceptables                       |

### Par module

| Module                                 | HIGH  | MEDIUM | LOW   | Total  |
| -------------------------------------- | ----- | ------ | ----- | ------ |
| Framework (`src/framework/`)           | 2     | 0      | 1     | 3      |
| Tickets (`pages/tickets/`)             | 0     | 9      | 2     | 11     |
| Tasks (`pages/tasks/`)                 | 0     | 4      | 0     | 4      |
| Interventions (`pages/interventions/`) | 0     | 3      | 0     | 3      |
| **Total**                              | **2** | **16** | **3** | **21** |

### Statut des items

| Item | Sévérité | Fichier                 | Statut  | Vérifié |
| ---- | -------- | ----------------------- | ------- | ------- |
| H1   | HIGH     | ColumnVisibility.tsx    | À faire |         |
| H2   | HIGH     | SortableColumnItem.tsx  | À faire |         |
| T1   | MEDIUM   | FlowProposalSection.tsx | À faire |         |
| T2   | MEDIUM   | FlowProposalSection.tsx | À faire |         |
| T3   | MEDIUM   | FlowProposalSection.tsx | À faire |         |
| T4   | MEDIUM   | FlowFeedbackSection.tsx | À faire |         |
| T5   | MEDIUM   | TicketDetailLayoutD.tsx | À faire |         |
| T6   | MEDIUM   | TicketDetailLayoutF.tsx | À faire |         |
| T7   | MEDIUM   | TicketDetailLayoutG.tsx | À faire |         |
| T8   | MEDIUM   | TicketCreateDialog.tsx  | À faire |         |
| TK1  | MEDIUM   | TaskFilters.tsx         | À faire |         |
| IV1  | MEDIUM   | InterventionFilters.tsx | À faire |         |

### Bons patterns de référence (à suivre)

1. `FieldLabel` (framework) + `generateFieldId` → ID unique, `htmlFor` automatique
2. `RadioGroupWrapper` → `id={${base}-${option.value}}` + `htmlFor` par option
3. `MultiEnumField` → `id={${inputId}-${option.value}}` + `htmlFor` par checkbox
4. `KeyValueItemRenderer` / `InputDefinitionRenderer` → `htmlFor`/`id` matching

---

## HIGH — Framework (impact global)

### H1 — ColumnVisibility.tsx

**Fichier:** `packages/web-frontend/src/framework/components/columns/ColumnVisibility.tsx`
**Lignes:** ~337-368 (mode fallback sans drag & drop)
**Problème:** `<label>` HTML native sans `htmlFor`. Checkbox dynamique sans `id`.
**Impact:** Tous les tableaux avec column visibility toggle (workspaces, tasks, etc.)
**Fix:**

```tsx
// Avant
<label>
  <input type="checkbox" checked={...} onChange={...} />
  {column.label}
</label>

// Après
<label htmlFor={`col-${column.id}`}>
  {column.label}
</label>
<input id={`col-${column.id}`} type="checkbox" checked={...} onChange={...} />
```

**Comment vérifier**

1. **Page:** Accéder à n'importe quel tableau de l'application (ex : `/tasks` ou la liste de tickets).
2. **Élément:** Cliquer sur le bouton de paramétrage des colonnes (icône engrenage ou colonnes, en haut à droite du tableau) pour ouvrir le panneau de visibilité des colonnes. Dans le mode sans drag & drop (fallback), repérer les checkboxes de colonnes.
3. **Action:** Cliquer directement sur le texte du nom d'une colonne (ex : "Status", "Priority") — pas sur la checkbox elle-même.
4. **Résultat attendu:** La checkbox correspondante bascule (coche/décoche) — confirmant que `htmlFor` est bien connecté à l'`id` de la checkbox.

---

### H2 — SortableColumnItem.tsx

**Fichier:** `packages/web-frontend/src/framework/components/columns/SortableColumnItem.tsx`
**Lignes:** ~111-137
**Problème:** `<label>` native wrap autour du checkbox sans `htmlFor` explicite.
Wrapping fonctionne techniquement mais est moins robuste et viole l'accessibilité explicite.
**Impact:** Toute la gestion de colonnes drag & drop
**Fix:** Extraire le checkbox hors du label, ajouter `id`/`htmlFor` explicites.

**Comment vérifier**

1. **Page:** Accéder à n'importe quel tableau de l'application (ex : `/tasks` ou la liste de tickets).
2. **Élément:** Cliquer sur le bouton de paramétrage des colonnes pour ouvrir le panneau drag & drop (mode normal, avec poignée de déplacement visible sur chaque ligne de colonne).
3. **Action:** Cliquer directement sur le texte du nom d'une colonne (ex : "Status") dans la liste drag & drop — pas sur la checkbox.
4. **Résultat attendu:** La checkbox correspondante bascule — confirmant que `htmlFor` explicite est connecté à l'`id` de la checkbox (et non plus via wrapping implicite).

---

## MEDIUM — Module Tickets

### T1 — FlowProposalSection.tsx : "Start line" / "End line"

**Fichier:** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`
**Lignes:** ~226-244
**Labels:** "Start line", "End line"
**Fix:**

```tsx
<Label htmlFor="review-start-line">Start line</Label>
<Input id="review-start-line" type="number" ... />
<Label htmlFor="review-end-line">End line</Label>
<Input id="review-end-line" type="number" ... />
```

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "G" dans le switcher de layout (haut droite) → onglet "Flow Design".
2. **Élément:** Dans la proposal card, déplier la section "Add review thread" (collapsible). Repérer les labels "Start line" et "End line".
3. **Action:** Cliquer sur le texte "Start line".
4. **Résultat attendu:** Le champ number correspondant prend le focus (bordure bleue visible).
5. **Répéter:** Cliquer sur le texte "End line" → le second champ number prend le focus.

---

### T2 — FlowProposalSection.tsx : "Rejection reason"

**Lignes:** ~597
**Label:** "Rejection reason"
**Fix:**

```tsx
<Label htmlFor="reject-reason">Rejection reason</Label>
<Textarea id="reject-reason" value={rejectReason} ... />
```

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "G" dans le switcher de layout → onglet "Flow Design".
2. **Élément:** Dans la proposal card, ouvrir le formulaire de rejet (bouton "Reject"). Repérer le label "Rejection reason".
3. **Action:** Cliquer sur le texte "Rejection reason".
4. **Résultat attendu:** La textarea de motif de rejet prend le focus (curseur visible, bordure bleue).

---

### T3 — FlowProposalSection.tsx : "Additional context (optional)" + "Request a new flow design"

**Lignes:** ~744 et ~810
**Problème:** Deux formulaires de demande de design. Le premier a un `<Label>` sans `htmlFor`,
le second a un `<p className="text-sm font-medium">` qui ressemble à un label mais n'en est pas un.
**Fix:**

```tsx
// Formulaire 1 (ligne ~744)
<Label htmlFor="context-input">Additional context (optional)</Label>
<Textarea id="context-input" value={context} ... />

// Formulaire 2 (ligne ~810) — remplacer le <p> par un vrai <Label>
<Label htmlFor="new-design-context" className="text-sm font-medium">
  Request a new flow design
</Label>
<Textarea id="new-design-context" value={context} ... />
```

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "G" → onglet "Flow Design".
2. **Élément (formulaire 1):** Si aucune proposal n'existe ou si le bouton "Re-request" est visible, chercher le label "Additional context (optional)" au-dessus d'une textarea.
3. **Action:** Cliquer sur le texte "Additional context (optional)".
4. **Résultat attendu:** La textarea prend le focus.
5. **Élément (formulaire 2):** Chercher le texte "Request a new flow design" (anciennement un `<p>`, maintenant un `<Label>`).
6. **Action:** Cliquer sur ce texte.
7. **Résultat attendu:** La textarea associée prend le focus.

---

### T4 — FlowFeedbackSection.tsx : ArrayFieldInput label

**Lignes:** ~69-72
**Problème:** `<Label>` sans `htmlFor` dans le composant `ArrayFieldInput` (réutilisé 3×).
**Fix:**

```tsx
// Dans ArrayFieldInput
const inputId = `array-field-${label.toLowerCase().replace(/\s+/g, '-')}`;
<Label htmlFor={inputId}>{label}</Label>
<Input id={inputId} value={draft} ... />
```

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "G" → onglet "Feedback".
2. **Élément:** Cliquer sur "Edit" sur une feedback card existante pour passer en mode édition. Repérer les champs de type ArrayFieldInput (ex : "Tags", "Strengths", "Weaknesses" ou libellés similaires selon le feedback).
3. **Action:** Cliquer sur le texte du label d'un de ces champs (ex : "Tags").
4. **Résultat attendu:** Le champ texte (input de saisie) correspondant prend le focus — confirmant que `htmlFor` est connecté à l'`id` de l'input.

---

### T5 — TicketDetailLayoutD.tsx : "Labels" input

**Lignes:** ~368
**Label:** "Labels"
**Fix:** `<Label htmlFor="label-input">Labels</Label>` + `id="label-input"` sur l'Input.

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "D" dans le switcher de layout (haut droite).
2. **Élément:** Repérer le champ "Labels" dans le formulaire (panneau d'édition des métadonnées du ticket).
3. **Action:** Cliquer sur le texte "Labels".
4. **Résultat attendu:** Le champ input correspondant prend le focus (curseur visible ou bordure bleue).

---

### T6 — TicketDetailLayoutF.tsx : "Reply" textarea AI

**Lignes:** ~370
**Problème:** Textarea sans label du tout.
**Fix:** `<Label htmlFor="ai-reply">Reply</Label>` + `id="ai-reply"` sur la Textarea.

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "F" dans le switcher de layout (haut droite).
2. **Élément:** Repérer la textarea de réponse AI (zone de saisie pour la réponse/reply). Le label "Reply" doit être visible au-dessus.
3. **Action:** Cliquer sur le texte "Reply".
4. **Résultat attendu:** La textarea prend le focus (curseur visible, bordure bleue).

---

### T7 — TicketDetailLayoutG.tsx : "Labels" input

**Lignes:** ~533-591
**Problème:** Texte "Labels" rendu dans un `<div>` sans composant Label.
**Fix:** Remplacer le `<div>` par `<Label htmlFor="labels-input">Labels</Label>` + `id="labels-input"`.

**Comment vérifier**

1. **Page:** Ticket detail → cliquer sur "G" dans le switcher de layout (haut droite).
2. **Élément:** Repérer le champ "Labels" dans le panneau de métadonnées ou dans le formulaire du layout G.
3. **Action:** Cliquer sur le texte "Labels".
4. **Résultat attendu:** Le champ input correspondant prend le focus — confirmant que le `<div>` a bien été remplacé par un `<Label>` avec `htmlFor` connecté.

---

### T8 — TicketCreateDialog.tsx : "Project" select

**Lignes:** ~132-134
**Label:** "Project"
**Fix:** `<Label htmlFor="project-select">Project</Label>` + `id="project-select"` sur SelectTrigger.

**Comment vérifier**

1. **Page:** Depuis n'importe quelle page, ouvrir la boîte de dialogue "New Ticket" (bouton de création de ticket).
2. **Élément:** Repérer le label "Project" au-dessus du select de projet.
3. **Action:** Cliquer sur le texte "Project".
4. **Résultat attendu:** Le select/trigger de projet prend le focus (bordure bleue visible sur le SelectTrigger).

---

## MEDIUM — Tasks & Interventions

### TK1 — TaskFilters.tsx : 4 filtres

**Fichier:** `packages/web-frontend/src/app/pages/tasks/TaskFilters.tsx`
**Problème:** 4 `<div className="...font-medium">` utilisés comme labels de filtres sans `htmlFor`.
**Labels affectés:** "Status", "Priority", "Worker ID", "Flow ID"
**Fix:** Remplacer chaque `<div>` par `<Label htmlFor="xxx">` et ajouter `id="xxx"` sur les inputs correspondants (qui ont déjà des `id` — juste connecter).

**Comment vérifier**

1. **Page:** Naviguer vers `/tasks`.
2. **Élément:** Repérer le panneau de filtres (barre latérale ou section de filtres en haut). Identifier les labels "Status", "Priority", "Worker ID", "Flow ID".
3. **Action:** Cliquer successivement sur chacun des textes de label ("Status", "Priority", "Worker ID", "Flow ID").
4. **Résultat attendu:** Pour chaque clic, le select ou input de filtre correspondant prend le focus — confirmant que les `<div>` ont bien été remplacés par des `<Label>` avec `htmlFor`.

---

### IV1 — InterventionFilters.tsx : 3 filtres

**Fichier:** `packages/web-frontend/src/app/pages/interventions/InterventionFilters.tsx`
**Problème:** 3 `<div className="...font-medium">` sans `htmlFor`.
**Labels affectés:** "Status", "Type", "Blocking", "Task ID"
**Fix:** Même pattern que TK1.

**Comment vérifier**

1. **Page:** Naviguer vers `/interventions`.
2. **Élément:** Repérer le panneau de filtres. Identifier les labels "Status", "Type", "Blocking", "Task ID".
3. **Action:** Cliquer successivement sur chacun des textes de label.
4. **Résultat attendu:** Pour chaque clic, le select ou input de filtre correspondant prend le focus — confirmant que les `<div>` ont bien été remplacés par des `<Label>` avec `htmlFor`.

---

## LOW — Zones read-only ou cosmétique

### L1 — TicketDetailLayoutA/B/C/E/F.tsx : "Labels" et "Custom Fields"

Zones d'affichage read-only (badges, liste) — pas d'input à connecter.
Aucune action requise.

### L2 — FlowFeedbackSection.tsx : "Rating" label

RatingInput = boutons star, pas un input standard HTML.
Amélioration optionnelle : `aria-labelledby` pour accessibilité screen reader.

### L3 — SearchInput.stories.tsx

Fichier de demo Storybook, pas de code de production. Correction optionnelle pour l'exemple.

---

## Plan d'implémentation

### Priorité 1 — Framework (impact maximal, déléguer à frontend-dev)

- H1: `ColumnVisibility.tsx`
- H2: `SortableColumnItem.tsx`

### Priorité 2 — Tickets (module principal, déléguer à frontend-dev)

- T1 → T8 : tous dans `FlowProposalSection.tsx`, `FlowFeedbackSection.tsx`,
  `TicketDetailLayoutD.tsx`, `TicketDetailLayoutF.tsx`, `TicketDetailLayoutG.tsx`,
  `TicketCreateDialog.tsx`
- T3 est le fix **dh** demandé par l'utilisateur

### Priorité 3 — Tasks/Interventions (déléguer à frontend-dev)

- TK1: `TaskFilters.tsx`
- IV1: `InterventionFilters.tsx`

### Lessons learned à ajouter

> Label/input connectivity rule: tout `<Label>`, `<label>`, `<p>`, `<span>` ou `<div>`
> utilisé visuellement comme un label de formulaire DOIT avoir `htmlFor` connecté à un
> `id` sur l'input correspondant. Ne pas wrapper un input dans un label — utiliser
> htmlFor/id explicitement. Pattern de référence: `FieldLabel` du framework avec
> `generateFieldId`. WCAG 2.1 Level A exigence.
