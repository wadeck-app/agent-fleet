# Plan — UX Feedback Round 6

**Date:** 2026-03-24
**Objectif:** Corriger les bugs et améliorations UX identifiés lors du test de la session précédente.

---

## Statut global

| Groupe               | Items                                                               | Statut                                |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| D — Flow Design      | D2 visual                                                           | TODO                                  |
| E2 — Feedback CRUD   | e2-icons, e2-inline, e2-save, e2-delete-dialog, e2-delete-confirmed | TODO                                  |
| F — Label audit      | f-table (améliorer les descriptions pour les tests utilisateur)     | TODO                                  |
| G — UX général       | ga, gc, ge, gf                                                      | TODO                                  |
| G — Design/Réflexion | gb, gd                                                              | TODO (réponse textuelle, pas de code) |
| CLAUDE.md            | UX optimistic pattern manquant                                      | TODO                                  |

---

## Groupe D — Flow Design

### D2 — Visualize modal : afficher le graphe ReactFlow en lecture seule

**Problème :** La modal "Visualize" affiche une liste de texte illisible. L'utilisateur attend une preview visuelle du flow (graphe avec nodes/edges), pas du texte brut.

**Fichiers :**

- `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`
- `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorCanvas.tsx` (existant, ReactFlow)
- `packages/web-frontend/src/app/pages/flows/flow-editor/nodes/` (nodeTypes existants)

**Fix :**

1. Convertir `proposal.proposedFlow` (steps array) en `nodes[]` + `edges[]` au format ReactFlow (même format que le flow editor existant).
2. Dans la modal, remplacer la liste de texte par un `<FlowEditorCanvas>` en **lecture seule** (`nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}`, `panOnDrag={true}`, `zoomOnScroll={true}`).
3. Taille fixe de la modal : `h-[60vh]` minimum.
4. Pas de panel de propriétés, pas de toolbar — juste le canvas + MiniMap.

**Après :** Cliquer "Visualize" → graphe interactif (pan/zoom) avec les nodes colorés par type (model, script, user_intervention, subflow), read-only.

---

## Groupe E2 — Feedback CRUD

### e2-icons — Utiliser les composants d'icône standard

**Problème :** Les icônes ✏ et 🗑 ont été implémentées en custom. Le projet interdit le custom : utiliser les composants primitifs existants.

**Pattern correct :**

```tsx
// Bouton icône standard : Button variant="ghost" size="icon-sm" avec icône Lucide
<Button variant="ghost" size="icon-sm" onClick={handleEditOpen} aria-label="Edit feedback">
  <Pencil />
</Button>
<Button variant="ghost" size="icon-sm" onClick={() => setDeleteOpen(true)} aria-label="Delete feedback">
  <Trash2 />
</Button>
```

`size="icon-sm"` est la taille standard pour les boutons icône dans l'application (voir `RemoveItemButton.tsx`).

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`

---

### e2-inline — Permettre l'édition des items existants dans ArrayFieldInput

**Problème :** `ArrayFieldInput` (composant local dans FlowFeedbackSection) ne permet que add/remove. En mode édition, les items "What went well" / "What went wrong" / "Suggestions" sont affichés en lecture seule.

**Fix :** Dans `ArrayFieldInput`, rendre chaque item éditable inline :

- Remplacer le `<span>` de chaque item par un `<Input>` pré-rempli avec la valeur actuelle.
- `onChange` de l'Input met à jour l'item correspondant dans le tableau.
- Le `RemoveItemButton` existant reste pour supprimer.
- Pas de nouveau composant — modifier directement `ArrayFieldInput` dans `FlowFeedbackSection.tsx`.

**Après :** En mode édition, cliquer sur un item existant permet de le modifier directement.

---

### e2-save — Pattern optimiste : blur jusqu'à confirmation serveur

**Problème :** Après Save, l'onglet entier se rafraîchit (full re-fetch). Mauvais pattern : visible comme du bruit pour l'utilisateur.

**Pattern attendu (voir CLAUDE.md — UX Optimistic Updates) :**

1. Au clic Save : mettre à jour l'état local (`feedbackItems`) immédiatement avec les nouvelles valeurs.
2. Afficher la carte en `opacity-50 pointer-events-none` (blur = pending).
3. Appel API en background.
4. Sur succès : retirer le blur (la carte reste avec les nouvelles valeurs déjà affichées).
5. Sur erreur : rollback des valeurs locales + toast d'erreur.

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`

---

### e2-delete-dialog — Utiliser AlertDialogWrapper

**Problème :** Le code copie-colle les composants `AlertDialog*` de Radix directement au lieu d'utiliser le wrapper existant.

**Composant existant :** `@framework/components/overlays/AlertDialogWrapper`
Props : `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `variant` ('danger' | 'warning' | 'info'), `icon`, `size`.

**Fix :** Dans `FlowFeedbackSection.tsx`, remplacer le bloc `AlertDialog > AlertDialogContent > ...` par :

```tsx
<AlertDialogWrapper
	open={deleteOpen}
	onOpenChange={setDeleteOpen}
	title="Delete feedback"
	description="This action cannot be undone."
	confirmLabel="Delete"
	variant="danger"
	icon={<Trash2 />}
	onConfirm={handleDelete}
/>
```

---

### e2-delete-confirmed — Pattern optimiste pour la suppression : strikethrough

**Problème :** Même problème que e2-save : full refresh au lieu de pattern optimiste.

**Pattern attendu :**

1. Au clic "Delete" (confirm) : marquer l'item localement avec `isDeleting: true`.
2. Afficher la carte avec `line-through opacity-50` (strikethrough = pending deletion).
3. Appel API en background.
4. Sur succès : retirer la carte du tableau local.
5. Sur erreur : retirer le marquage `isDeleting` + toast d'erreur.

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`

---

## Groupe F — Amélioration du tableau de test

### f-table — Reformuler les descriptions pour les tests utilisateur

**Problème :** Les descriptions dans le tableau "À vérifier" sont trop vagues pour savoir exactement où aller dans l'UI.

**Fix :** Pour chaque item F/Txx, préciser :

- La page exacte (ex: "Ticket detail → Layout G → onglet Flow Design")
- L'élément à cliquer (ex: "cliquer le texte 'Rejection reason' dans la section Reject")
- Ce qui doit se passer (ex: "le textarea prend le focus — bordure bleue visible")

---

## Groupe G — UX général

### ga — Tabs Comments/Triggered : ajouter hover + convertir LayoutSwitcher

**Problème :** Les onglets Comments/Triggered/etc. (`TabsTrigger` Radix) n'ont pas d'effet hover. Le `LayoutSwitcher` utilise `Button variant="ghost"` custom au lieu des primitives Tabs.

**Fix — Partie 1 : Ajouter hover sur TabsTrigger**
Dans `packages/web-frontend/src/framework/components/primitives/tabs.tsx`, ajouter `hover:bg-accent/50` (même style que `TabButton.tsx`) sur le variant/className de `TabsTrigger`.
**Note :** Composant partagé — vérifier les régressions visuelles sur toutes les pages avec Tabs après le changement.

**Fix — Partie 2 : Convertir LayoutSwitcher vers les primitives Tabs**
Dans `packages/web-frontend/src/app/pages/tickets/LayoutSwitcher.tsx`, remplacer les `<Button>` custom par les composants `<Tabs>` / `<TabsList>` / `<TabsTrigger>` du framework, de sorte que A/B/C/... utilisent exactement le même composant et le même hover que Comments/Triggered/etc.

### gc — Texte "The AI raised these questions" : taille incohérente

**Problème :** Le texte d'introduction de la section "Questions from the AI" a `text-xs text-muted-foreground` (très petit), alors que le texte courant du ticket (description, commentaires) est en `text-sm`.

**Fix :** Dans `FlowProposalSection.tsx`, dans le contenu de la `CollapsibleSection` "Questions from the AI", remplacer `text-xs` par `text-sm` sur le paragraphe d'introduction.

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

### ge — Design des CollapsibleSection : ambiguïté click area

**Problème :** La `CollapsibleSection` a une bordure sur toute la box, ce qui suggère visuellement que toute la box est cliquable. Mais seule la partie gauche (le `Button`) a l'effet hover. Le `headerRight` (ex: "Visualize", badge "4 questions") est du texte ou un bouton séparé, ce qui crée une confusion UX.

**Fix :** Supprimer la classe `border` du container `<div>` dans `CollapsibleSection`. Conserver uniquement un fond subtle pour délimiter (ex: `bg-muted/20` ou rien). Observer le rendu — si une séparation visuelle manque, ajouter un `border-b` ou un `mt-2` espaceur plutôt qu'une bordure englobante.

**Fichier :** `packages/web-frontend/src/app/pages/tickets/CollapsibleSection.tsx`

### gf — Feedback save : full tab refresh au lieu de déblur local

**Problème :** Après la sauvegarde d'un feedback, le WS event `B2F_TICKET_FEEDBACK_SUBMITTED` déclenche `fetchFeedback()`, ce qui reload toute la liste. Le bon pattern (e2-save) est de ne pas re-fetcher : juste retirer le blur de l'item déjà mis à jour localement.

**Fix :** Dans `FlowFeedbackSection`, le subscriber WS `B2F_TICKET_FEEDBACK_SUBMITTED` doit ignorer les events provenant des mutations locales (l'état local est déjà correct). Options :

- Utiliser un ref `isLocalMutation` à `true` pendant les appels API locaux — le subscriber ignore si `isLocalMutation.current === true`.
- Ou : ne pas subscriber du tout au WS event pour les mises à jour locales, uniquement pour les events externes (multi-tab).

**Note :** Ce fix est couplé avec e2-save et e2-delete-confirmed — à implémenter ensemble.

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`

---

## Groupe G — Réflexion / Pas de code

### gb — Alternatives UX au workflow actuel

Le workflow actuel : créer ticket → attendre action plan (commentaire worker-ai) → review plan → demander flow design manuellement → review flow → approve → exécution.

**5 approches alternatives :**

1. **Auto-request flow on ticket creation** : Dès qu'un ticket est créé, le système demande automatiquement un flow design en parallèle de l'action plan. L'utilisateur voit les deux arriver simultanément. Gain : supprime l'étape "demander manuellement".

2. **Wizard guided creation** : Remplacer le formulaire de création de ticket par un wizard 3 étapes : (1) titre + description, (2) questions de clarification AI en temps réel, (3) preview du flow proposé avant même de créer le ticket. L'utilisateur confirme = ticket créé + flow design déjà disponible.

3. **Inline approval dans le commentaire** : L'action plan du worker-ai contient des boutons inline "Approve plan → generate flow" directement dans le commentaire, sans avoir à naviguer vers un onglet Flow Design séparé. Gain : réduit les changements de contexte.

4. **Template-based flow** : Pour les types de tickets récurrents (bug fix, new page, refactor), proposer des templates de flow pré-approuvés. L'utilisateur choisit un template au moment de la création → flow disponible immédiatement, sans attente du LLM. Le LLM intervient seulement pour adapter le template.

5. **Auto-approve avec confidence threshold** : Si le `confidenceScore` de la proposal est ≥ 85%, approuver automatiquement et démarrer l'exécution sans intervention humaine. L'utilisateur reçoit une notification "Flow started automatically (confidence: 92%)" avec possibilité d'annuler pendant les 60 premières secondes.

### gd — Flow proposal ne suit pas l'action plan

**Observation :** Le flow design proposé par le LLM ne prend pas en compte le plan d'action fourni par worker-ai:ticket-intake dans les commentaires.

**Cause probable :** `FlowDesignerAgent.buildPrompt()` n'injecte pas le contenu des commentaires existants (notamment l'action plan) dans le contexte du prompt.

**Fix probable :** Passer les commentaires du ticket (en particulier ceux de `worker-ai:ticket-intake`) comme contexte additionnel dans le prompt de `FlowDesignerAgent`. Investiguer `buildPrompt()` dans `packages/web-backend/src/agents/FlowDesignerAgent.ts`.

---

## CLAUDE.md — UX Pattern à ajouter

Ajouter dans `CLAUDE.md` la section suivante :

```markdown
## UX Patterns

**Optimistic updates** — pattern obligatoire pour toutes les mutations locales :

- **Create/Update**: mettre à jour l'état local immédiatement → afficher l'item en `opacity-50 pointer-events-none` (pending) → sur succès: retirer le blur → sur erreur: rollback + toast.
- **Delete**: marquer l'item avec `line-through opacity-50` (pending) → sur succès: retirer de la liste → sur erreur: rollback + toast.
- Ne jamais déclencher un re-fetch complet de la liste après une mutation locale — le WS event sert uniquement pour les updates _externes_ (autre onglet/utilisateur).
```

---

## Ordre d'implémentation

```
CLAUDE.md (UX pattern) — immédiat, pas de code frontend
  ↓
e2-save + e2-delete-confirmed + gf — même fichier, même pattern, à faire ensemble
  ↓
e2-icons — simple, 1 fichier
e2-inline — modifier ArrayFieldInput, 1 fichier
  ↓
e2-delete-dialog — créer AlertDialogWrapper + l'utiliser
  ↓
gc — 1 ligne, trivial
ge — modifier CollapsibleSection
ga — modifier tabs.tsx ou LayoutG (vérifier régressions)
  ↓
D2 visual — le plus complexe, dépend de FlowEditorCanvas read-only
```

**Délégation :** Tout `packages/web-frontend/src/**` → agent `frontend-dev`. CLAUDE.md → ici directement.
