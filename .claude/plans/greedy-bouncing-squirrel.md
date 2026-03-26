# Plan d'implémentation — Round 5 + Audit Qualité

**Date:** 2026-03-20
**Objectif:** Corriger tous les todos non implémentés avec tests avant/après et audit de cohérence.

---

## Statut global (2026-03-20)

| Groupe                          | Items                                                                 | Statut                     |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| A — Backend critique            | A1/dj, A2/dl, A3/ec                                                   | ✅ DONE — npm run check ✅ |
| C/dn — Race condition triggered | dn                                                                    | ✅ DONE — npm run check ✅ |
| B — Frontend UX simples         | B1/da, B2/db, B3/de, B4/dg, B5/di, B6/dm, B7/p-fix2, B8/eb, B9/c-fix2 | ✅ DONE — npm run check ✅ |
| D — Frontend medium             | D1/dc CollapsibleSection, D2/do-2 preview modal                       | ✅ DONE — npm run check ✅ |
| E — Update/delete feedback      | E1 backend, E2 frontend                                               | ✅ DONE — npm run check ✅ |
| F — Label audit                 | 21 issues framework+tickets+tasks+interventions                       | ✅ DONE — npm run check ✅ |

**Tests utilisateur :** différés à la fin de tous les groupes.

---

## Contexte

Suite aux rounds de feedback UX 3-5, un ensemble de bugs et améliorations ont été identifiés
mais pas encore implémentés. Ce plan couvre l'intégralité des points ouverts, organisés en
groupes logiques par dépendance et domaine. Chaque item inclut :

- **Avant :** comment observer/reproduire le problème actuel
- **Fix :** description précise du changement
- **Après :** comment vérifier que c'est résolu
- **Cohérence :** impacts potentiels sur d'autres parties

---

## Groupe A — Backend critique (sans dépendances frontend)

### A1 — dj : `requestFlowDesign` n'émet pas `B2F_FLOW_PROPOSAL_UPDATED`

**Fichier :** `packages/web-backend/src/services/FlowProposalsService.ts`

**Avant :** Demander un nouveau flow design → le tab count et le contenu de l'onglet Flow Design
ne se rafraîchissent pas automatiquement. L'utilisateur doit recharger la page.
`triggerRedesignAsync` (après rejet) émet l'event (ligne 327), mais `requestFlowDesign` non.

**Fix :** Après le `await this.ticketsRepository.update(ticketId, { currentFlowProposalId, status })`,
ajouter :

```typescript
this.eventBroadcaster.broadcast(B2F_FLOW_PROPOSAL_UPDATED, { ticketId } as any);
```

Même pattern que ligne 323-327 dans `triggerRedesignAsync`.

**Après :**

- Demander un flow design → onglet "Flow Design (1)" apparaît sans rechargement
- Le contenu de l'onglet se met à jour avec la nouvelle proposal
- Tester avec `dev-hold` sur l'endpoint pour capturer l'état intermédiaire

**Cohérence :** `useFlowProposals` dans LayoutG ET dans `FlowProposalSection` ont tous deux
un `useRealtimeRefresh` pour `B2F_FLOW_PROPOSAL_UPDATED` → les deux instances se rafraîchiront.

---

### A2 — dl : Version numbering des proposals

**Fichier :** `packages/web-backend/src/services/FlowProposalsService.ts`

**Avant :** Après un flow approuvé (v2), demander un nouveau design crée une proposal v1.
`proposals[0]` = v2 (trié version DESC) → la nouvelle v1 n'est jamais affichée dans l'UI.
`requestFlowDesign` ligne 96 : `version: 1` hardcodé.

**Fix :** Avant de créer la proposal, récupérer les proposals existantes et calculer le max :

```typescript
const existingProposals = await this.proposalsRepository.findByTicketId(ticketId);
const maxVersion = existingProposals.reduce((m, p) => Math.max(m, p.version), 0);
const proposal: FlowProposal = {
  ...
  version: maxVersion + 1,  // était: version: 1
  ...
};
```

**Après :**

- Après approval d'un v2 + nouvelle demande → proposal créée avec version 3
- `proposals[0]` = v3 (trié DESC) → affiché comme currentProposal
- Vérifier via API : `GET /api/tickets/:id/flow-proposals` → `[v3 pending_review, v2 approved, ...]`

**Cohérence :** `FlowProposalsRepository.create` gère déjà les versions > 1 (lignes 32-43).
`triggerRedesignAsync` utilise déjà `rejectedProposal.version + 1` — même pattern.

---

### A3 — ec : Boucle de retry LLM sur validation

**Fichier :** `packages/web-backend/src/agents/FlowDesignerAgent.ts`

**Avant :** LLM génère parfois un flow sans `model` sur les steps `type: model` ou sans
`gitStrategy`. L'erreur est immédiatement propagée à l'utilisateur. Même ticket, même
description → parfois succès, parfois échec.
Bloc actuel (lignes 548-556) : `throw new Error(...)` immédiat.

**Fix — Partie 1 : Prompt hardening**
Dans `buildPrompt`, dans la section RULES/FORMATTING (après ligne 296), ajouter :

```
- Steps of type "model" MUST include a "model" field: "sonnet", "haiku", or "opus" (REQUIRED, no default)
- workspace.gitStrategy is REQUIRED: one of main-only | feature-branch | any | worktree
```

**Fix — Partie 2 : Retry loop (max 2 retries)**
Extraire `callClaude` + `parseClaudeResponse` dans une méthode privée `callAndParse(prompt)`.
Remplacer le bloc de validation par :

```typescript
private async callAndParse(prompt: string): Promise<FlowDesignOutput> {
  const output = await this.callClaude(prompt);
  return this.parseClaudeResponse(output);
}

// Dans designFlow(), remplacer le bloc validation :
const MAX_RETRIES = 2;
let result = await this.callAndParse(mainPrompt);
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const validation = this.registry.validateFlow(result.proposedFlow as unknown as FlowDefinition);
  if (validation.valid) break;
  if (attempt === MAX_RETRIES - 1) {
    const errors = validation.issues.filter(i => i.severity === 'error').map(i => i.message).join('; ');
    throw new Error(`Claude-generated flow failed validation after ${MAX_RETRIES} retries: ${errors}`);
  }
  const errors = validation.issues.filter(i => i.severity === 'error').map(i => `- ${i.message}`).join('\n');
  const correctionPrompt = `Your flow design failed validation with these errors:\n${errors}\n\nReturn ONLY the corrected JSON, fixing all errors. Do not change any other fields.`;
  result = await this.callAndParse(correctionPrompt);
}
// Les évaluateurs s'exécutent après validation réussie (inchangé)
```

**Après :**

- Créer un ticket avec description complexe → le design doit aboutir sans erreur
- Vérifier dans les logs que les retries se produisent quand nécessaire
- Tests unitaires : mock le premier appel avec flow invalide, second appel avec flow valide → résultat final valide

**Cohérence :** Les évaluateurs (`computeConfidenceScore`) s'exécutent APRÈS la boucle de
validation → inchangé. Le flow final passé aux évaluateurs est toujours valide.

---

### A4 — df : WS event sur toutes les mutations feedback

**Fichier :** `packages/web-backend/src/services/FlowFeedbackService.ts`

**Avant :** `submitFeedback` émet `B2F_TICKET_FEEDBACK_SUBMITTED` (ligne 86). Les futures
méthodes `updateFeedback` et `deleteFeedback` (item dd) devront aussi émettre cet event.
**Note :** A4 est un prérequis de dd — à implémenter en même temps que le Groupe E.

**Fix :** Dans `updateFeedback` et `deleteFeedback` (nouvelles méthodes, voir Groupe E),
toujours émettre `B2F_TICKET_FEEDBACK_SUBMITTED` après la mutation :

```typescript
this.eventBroadcaster.broadcast(B2F_TICKET_FEEDBACK_SUBMITTED, {
	ticketId,
	feedbackId: feedback.id,
	rating: feedback.rating,
});
```

**Cohérence :** `useFlowFeedbackCount` et `FlowFeedbackSection` répondent à cet event.
Toute mutation (create/update/delete) le déclenchera → liste et count à jour sans reload.

---

## Groupe B — Frontend : fixes UX simples

**Déléguer ENSEMBLE à un agent frontend-dev après Groupe A.**
**Valider chaque item avec `agent-browser` + screenshot.**

### B1 — da : Sort order dans l'onglet Feedback

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`

**Avant :** Le toggle "Oldest first" / "Newest first" (présent dans LayoutG) n'affecte pas
l'onglet Feedback. Les cartes sont dans l'ordre de récupération API (non garanti).

**Fix :**

- `FlowFeedbackSection` accepte `sortOrder: 'asc' | 'desc'` prop (comme les autres sections)
- Passer depuis LayoutG : `<FlowFeedbackSection ... sortOrder={sortOrder} />`
- Trier les items avant rendu : `[...feedbackItems].sort((a, b) => sortOrder === 'asc' ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt))`

**Après :**

- Naviguer vers onglet Feedback, noter l'ordre des dates
- Cliquer "Oldest/Newest first" → ordre inversé
- Screenshot avant/après toggle

---

### B2 — db : Supprimer la bannière "Submitted"

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`

**Avant :** Une bannière verte "Submitted — Feedback has been submitted for this ticket."
apparaît quand un feedback existe, ajoutant une redondance visuelle (la liste est déjà là).

**Fix :** Supprimer le rendu du badge "Submitted" et du texte associé. Conserver le
bouton "Add another feedback".

**Après :** Onglet Feedback avec données → plus de bannière verte, juste la liste + bouton.

---

### B3 — de : Ligne verticale manquante premier item Activity

**Fichier :** `packages/web-frontend/src/app/pages/tickets/TicketActivitySection.tsx`

**Avant :** Ligne 145 : `{item !== timeline[timeline.length - 1] && <div className="h-full w-px bg-border" />}`
Compare avec `timeline` (unsorted) mais mappe sur `sorted`. En mode "Newest first" (DESC),
`sorted[0]` = `timeline[timeline.length - 1]` → condition fausse → ligne manquante sur le premier item.

**Fix :** Changer la comparaison pour utiliser l'index dans le tableau trié :

```tsx
// Remplacer la ligne 145 par :
{
	index < sorted.length - 1 && <div className="h-full w-px bg-border" />;
}
// (ajouter `index` comme second argument du .map)
```

**Après :** En mode "Newest first", le premier item affiché a bien sa ligne verticale.
Vérifier les deux modes (Oldest/Newest) → tous les items sauf le dernier ont la ligne.

---

### B4 — dg : Supprimer bouton "Request new design" en-tête proposal approuvée

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

**Avant :** Lignes ~622-624 : après une proposal approuvée ou rejetée, un bouton "Request new design"
apparaît dans l'en-tête de la proposal (à droite du texte "Approved at...").
Ce bouton duplique le formulaire en bas de page.

**Fix :** Supprimer les lignes ~620-624 (le `<Button onClick={onRequestNew}>Request new design</Button>`
dans la zone `isTerminal`). Le formulaire de demande en bas de page reste l'unique point d'entrée.

**Après :** Une proposal approuvée/rejetée ne montre plus ce bouton en-tête. Le formulaire du bas reste.

---

### B5 — di : Blur du formulaire "Request new design" pendant loading

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

**Avant :** Quand "Request new design" est cliqué, le bouton affiche un spinner mais le
textarea reste éditable. Incohérent avec les autres formulaires (FlowFeedbackSection,
handleStatusChange) qui utilisent `pointer-events-none opacity-50` pendant la requête.

**Fix :** Envelopper le contenu du formulaire de demande dans :

```tsx
<div className={isRequesting ? 'pointer-events-none opacity-50' : ''}>{/* textarea + bouton */}</div>
```

**Après :**

- Utiliser `dev-hold` sur `POST /api/tickets/:id/flow-proposals/request`
- Cliquer "Request new design" → formulaire grisé + spinner sur le bouton
- Screenshot de l'état en attente
- Relâcher le hold → formulaire redevient interactif

---

### B6 — dm/ea : Feedback tab (0) quand disabled

**Fichier :** `packages/web-frontend/src/app/pages/tickets/TicketDetailLayoutG.tsx`

**Avant :** Quand `!ticket.currentFlowProposalId`, l'onglet Feedback est `[disabled]` sans
badge count. `useFlowFeedbackCount` retourne déjà `count: 0, loading: false` quand `flowId` est null.

**Fix :** Remplacer le rendu conditionnel du TabsTrigger Feedback.
Le `TabCountBadge` peut coexister avec l'état `disabled`. La structure devient :

```tsx
<TabsTrigger value="feedback" disabled={!ticket.currentFlowProposalId}>
	Feedback
	<TabCountBadge count={feedbackCount} loading={feedbackCountLoading} />
</TabsTrigger>
```

Enlever le wrapper TooltipProvider/Tooltip autour du trigger — conserver le tooltip en
utilisant `title` ou un composant différent. Ou garder le tooltip mais l'appliquer à un
`<span>` wrapper sans modifier la logique du badge.

**Après :** Ticket sans flow proposal → onglet "Feedback (0)" visible (grisé + tooltip).

---

### B7 — p-fix2 : Confirm rejection taille + Cancel repositionné

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

**Avant :**

- "Confirm rejection" (ligne 604) : `size="sm"` → plus petit qu'"Approve" (pas de size)
- "Cancel" = le toggle Reject.../Cancel — confus UX

**Fix :**

1. Retirer `size="sm"` de "Confirm rejection"
2. Le bouton toggle garde un label FIXE "Reject..." (ne bascule plus vers "Cancel")
3. Dans le formulaire en-dessous, ajouter un bouton "Cancel" à côté de "Confirm rejection" :

```tsx
<div className="flex gap-2">
  <Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
    {isRejecting ? <Loader2 ... /> : null}
    Confirm rejection
  </Button>
  <Button variant="outline" onClick={() => { setShowRejectForm(false); setRejectReason(''); }} disabled={isRejecting}>
    Cancel
  </Button>
</div>
```

4. Mettre à jour `handleToggleRejectForm` pour ne gérer que l'ouverture (plus de toggle fermeture)

**Après :**

- [Approve] [Reject...] → clic "Reject..." → formulaire apparaît
- Dans formulaire : [Confirm rejection] [Cancel] — même taille qu'Approve
- Screenshot des 3 états : repos, formulaire ouvert, en cours de soumission

---

### B8 — eb : Markdown dans les commentaires de l'onglet Audit

**Fichier :** `packages/web-frontend/src/app/pages/tickets/TicketAuditLogSection.tsx`

**Avant :** Cas `ticket.comment_created` (ligne 52-75) : contenu rendu comme `<p>{content}</p>`
(texte brut). `TicketCommentsSection` utilise `ReactMarkdown` + `remarkGfm` pour les mêmes
contenus.

**Fix :** Dans le cas `ticket.comment_created`, remplacer `<p>{content}</p>` par :

```tsx
import ReactMarkdown from 'react-markdown';

import remarkGfm from 'remark-gfm';

// ...
<ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert max-w-none">
	{content}
</ReactMarkdown>;
```

Même pattern que `TicketCommentsSection.tsx`.

**Après :**

- Ajouter un commentaire avec `**gras**` et `- liste` → vérifier rendu dans Audit

---

### B9 — c-fix2 : Labels questions htmlFor

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

**Avant :** Dans la section "Questions from the AI", chaque question est un `<p>` sans
`htmlFor` et son `<Textarea>` n'a pas d'`id`. Violation de l'audit label (item dh).

**Fix :**

```tsx
{
	openQuestions.map((question, i) => (
		<div key={i} className="space-y-1">
			<Label htmlFor={`question-answer-${i}`} className="text-sm font-medium">
				{question}
			</Label>
			<Textarea
				id={`question-answer-${i}`}
				value={questionAnswers[i] ?? ''}
				onChange={e => handleAnswerChange(i, e.target.value)}
				placeholder="Your answer (optional)..."
				rows={2}
			/>
		</div>
	));
}
```

**Après :** Cliquer sur le label d'une question → focus sur le textarea associé.

---

## Groupe C — Frontend : investigation + fix WS (dn)

### C1 — dn : Triggered tab WS events

**Fichier :** `packages/web-frontend/src/app/pages/tickets/useTriggeredTasksCount.ts`
**Fichier backend :** `packages/web-backend/src/orchestrator/OrchestratorEventBridge.ts`

**Avant :** Après création d'un ticket, le worker-ai reçoit un commentaire mais le tab
"Triggered" reste à 0. `useTriggeredTasksCount` écoute `B2F_TASKS_UPDATED` sans filtre.
`B2F_TASKS_UPDATED` est broadcast avec payload vide `{}` par l'OrchestratorEventBridge.

**Investigation requise (à faire avant fix) :**

1. Créer un ticket et observer si `B2F_TASKS_UPDATED` apparaît dans les logs WS du navigateur
2. Vérifier via `GET /api/tasks?ticketId=XXX` si la tâche est créée avec le bon `ticketId`
3. Si la tâche n'a pas de `ticketId` → le fix est dans la création de tâche côté orchestrateur
4. Si `B2F_TASKS_UPDATED` ne fire pas → fix dans l'OrchestratorEventBridge

**Fix probable :** Si `B2F_TASKS_UPDATED` fire mais l'event n'est pas capturé :

- Vérifier que `useRealtimeRefresh` gère correctement les events sans filter (payload vide)
- Ajouter `B2F_TASK_CREATED` en plus de `B2F_TASKS_UPDATED` dans le hook

Si la tâche n'a pas `ticketId` :

- Investiguer comment la tâche est créée dans `OrchestratorEventBridge` ou le service associé

**Après :**

- Créer un ticket → observer le tab "Triggered" se mettre à jour automatiquement

---

## Groupe D — Frontend : features medium

### D1 — dc : CollapsibleSection + "Proposed flow" collapsé

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`
**Nouveau :** `packages/web-frontend/src/app/pages/tickets/CollapsibleSection.tsx`

**Avant :** Le YAML du flow s'affiche toujours en entier, prend toute la hauteur.
"Reasoning" a sa propre logique de collapse inline.

**Fix — Étape 1 : Créer CollapsibleSection.tsx :**

```tsx
interface CollapsibleSectionProps {
	title: string;
	defaultOpen?: boolean;
	headerRight?: React.ReactNode; // ex: "Open in Flow Editor"
	children: React.ReactNode;
}
```

Composant réutilisable avec état `open` (useState), toggle ChevronRight/Down,
header avec title + headerRight, body conditionnel.

**Fix — Étape 2 : Refactoriser "Reasoning" pour utiliser CollapsibleSection** (`defaultOpen=false`)

**Fix — Étape 3 : Envelopper le bloc YAML dans CollapsibleSection** (`defaultOpen=false`)
Le lien "Open in Flow Editor" passe dans `headerRight`.

**Après :**

- L'onglet Flow Design montre la proposal avec Reasoning et Proposed flow tous deux repliés
- Cliquer pour expand → YAML visible
- Re-cliquer → replié
- Vérifier que CollapsibleSection est utilisé aux deux endroits (Reasoning + Proposed flow)

---

### D2 — do-2 : Preview modal flow (blocs, pas éditeur complet)

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowProposalSection.tsx`

**Avant :** Le lien "Open in Flow Editor" est désactivé pour les proposals non-approuvées.
L'utilisateur ne peut pas visualiser le flow avant d'approuver.

**Fix :** Remplacer le bouton désactivé (quand non-approuvé) par un bouton "Visualize"
qui ouvre un `<Dialog>` modal affichant les steps du flow sous forme de cartes :

```tsx
// Pas d'appel backend — utiliser proposal.proposedFlow directement (déjà dans le state)
<Dialog>
	<DialogTrigger asChild>
		<Button variant="outline" size="sm">
			Visualize
		</Button>
	</DialogTrigger>
	<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
		<DialogHeader>
			<DialogTitle>{proposedFlow.name}</DialogTitle>
		</DialogHeader>
		{proposedFlow.steps.map(step => (
			<div key={step.id} className="rounded-md border p-3">
				<div className="flex items-center gap-2">
					<Badge variant="outline">{step.type}</Badge>
					<span className="font-medium">{step.name || step.id}</span>
				</div>
				{step.depends && <p className="text-xs text-muted-foreground">depends: {step.depends.join(', ')}</p>}
				{'prompt' in step && <p className="text-xs text-muted-foreground line-clamp-3">{step.prompt}</p>}
			</div>
		))}
	</DialogContent>
</Dialog>
```

**Pas de changement backend, pas de fichier temporaire.**

**Après :**

- Proposal pending_review → bouton "Visualize" visible
- Cliquer → modal avec liste des steps (type, nom, dépendances, aperçu prompt)
- Proposal approved → bouton "Open in Flow Editor" (lien réel)

---

## Groupe E — Feature complète : Update/Delete Feedback (dd)

### E1 — Backend : nouveaux endpoints

**Fichiers :**

- `packages/web-backend/src/repositories/FlowFeedbackRepository.ts` — ajouter `findById`, `update`, `delete`
- `packages/web-backend/src/services/FlowFeedbackService.ts` — ajouter `updateFeedback`, `deleteFeedback`
- `packages/web-backend/src/controllers/FlowFeedbackController.ts` — ajouter `PUT /api/flow-feedback/:feedbackId`, `DELETE /api/flow-feedback/:feedbackId`
- `packages/shared-frontend-backend/src/api/flow-feedback.contract.ts` — ajouter `UpdateFlowFeedbackSchema`

**Repository (nouveaux méthodes) :**

```typescript
async findById(id: string): Promise<FlowFeedback | null>
async update(id: string, data: Partial<FlowFeedback>): Promise<FlowFeedback>
async delete(id: string): Promise<void>
```

**Service (nouvelles méthodes) :**

```typescript
async updateFeedback(feedbackId: string, data: UpdateFlowFeedback): Promise<FlowFeedback>
  // Valider que le feedback existe, update, émettre B2F_TICKET_FEEDBACK_SUBMITTED, ajouter history entry

async deleteFeedback(ticketId: string, feedbackId: string): Promise<void>
  // Valider existence, supprimer, émettre B2F_TICKET_FEEDBACK_SUBMITTED
```

**Contract (nouveau schema) :**

```typescript
export const UpdateFlowFeedbackSchema = z.object({
	rating: z.number().min(1).max(5).optional(),
	wentWell: z.array(z.string()).optional(),
	wentWrong: z.array(z.string()).optional(),
	suggestions: z.array(z.string()).optional(),
});
```

### E2 — Frontend : inline edit + delete UI

**Fichier :** `packages/web-frontend/src/app/pages/tickets/FlowFeedbackSection.tsx`
**Fichier :** `packages/web-frontend/src/app/pages/tickets/feedbackApi.ts`

**feedbackApi ajouts :**

```typescript
updateFeedback: (feedbackId: string, data: UpdateFlowFeedback) => typedFetch('PUT', ...)
deleteFeedback: (feedbackId: string) => typedFetch('DELETE', ...)
```

**UI :**

- Chaque `FeedbackCard` reçoit des callbacks `onEdit` et `onDelete`
- `onEdit` : bascule la carte en mode édition inline (même composant ArrayFieldInput + RatingInput, pré-rempli)
- `onDelete` : ouvre un `<AlertDialog>` de confirmation avant de supprimer
- Après suppression : carte retirée, count mis à jour via WS event

**Après :**

- Modifier la note d'un feedback → carte mise à jour
- Supprimer un feedback → confirmation → carte disparaît, count décrémenté
- Recharger la page → modification persistée

---

## Groupe F — Label audit complet (dh + audit)

**Déléguer à un agent frontend-dev séparé** (touche de nombreux fichiers différents).
**Référence :** `.claude/plans/2026-03-20_label-input-audit.md`

**Priorité 1 — Framework (impact global) :**

- `ColumnVisibility.tsx` : ajouter `id={col-${column.id}}` + `htmlFor`
- `SortableColumnItem.tsx` : extraire checkbox du label, ajouter `htmlFor`/`id`

**Priorité 2 — Tickets (voir audit plan pour détails) :**

- `FlowProposalSection.tsx` : T1 (Start/End line), T2 (Rejection reason), T3 (Additional context + "Request new flow design" → remplacer `<p>` par `<Label htmlFor>`)
- `FlowFeedbackSection.tsx` : T4 (ArrayFieldInput)
- `TicketDetailLayoutD/G.tsx` : T5, T7 (Labels input)
- `TicketDetailLayoutF.tsx` : T6 (textarea AI sans label)
- `TicketCreateDialog.tsx` : T8 (Project select)

**Priorité 3 — Tasks/Interventions :**

- `TaskFilters.tsx` : TK1 (4 divs → Labels)
- `InterventionFilters.tsx` : IV1 (3 divs → Labels)

**Après :**

- Cliquer sur chaque label modifié → focus sur le champ associé
- Passer `htmlFor` sans `id` (ou vice-versa) → tester qu'aucune régression n'est introduite

---

## Ordre d'implémentation et dépendances

```
Groupe A (backend) — parallélisable entre A1/A2/A3/A4
  ↓
Groupe B (frontend simple) — parallélisable, dépend de A1 (WS event) pour tester correctement
  ↓
Groupe C (investigation) — indépendant
  ↓
Groupe D (features medium) — indépendant de C
  ↓
Groupe E (dd — feature complète) — dépend de A4 pour les WS events
  ↓
Groupe F (label audit) — indépendant, peut être en parallèle avec D/E
```

**Règle de délégation :** Tout changement dans `packages/web-frontend/src/**` → agent `frontend-dev`.
Backend → agent `backend-dev`. Ne pas mélanger dans un même agent.

---

## Tests de régression à valider après chaque groupe

### Après Groupe A

- [ ] `npm run check` passe
- [ ] Tests unitaires `FlowDesignerAgent.test.ts` passent (A3 ajoute des tests pour le retry)
- [ ] `GET /api/tickets/:id/flow-proposals` retourne la bonne version après A2
- [ ] `B2F_FLOW_PROPOSAL_UPDATED` observable dans les WS logs après A1

### Après Groupe B

- [ ] Tous les onglets testés dans les deux modes sort (Oldest/Newest)
- [ ] Screenshots `dev-hold` pour di (formulaire grisé)
- [ ] Aucun onglet sans badge count (dm/ea)
- [ ] Pas de régression sur la logique Approve/Reject (p-fix2)
- [ ] Markdown rendu dans Audit (eb)

### Après Groupe D

- [ ] "Visualize" ouvre une modal non-bloquante (do-2)
- [ ] CollapsibleSection réutilisé pour Reasoning ET Proposed flow (dc)
- [ ] Aucun onglet masqué derrière la modal

### Après Groupe E

- [ ] CRUD complet sur feedback avec WS live (count mis à jour sans reload)
- [ ] Tests backend pour `updateFeedback` et `deleteFeedback`
- [ ] Cohérence avec l'audit trail (history entries)

### Après Groupe F

- [ ] Clic sur chaque label corrigé → focus sur le champ
- [ ] Aucune régression dans les formulaires existants

---

## Audit qualité / cohérence — points transversaux

1. **WS events** : Chaque mutation qui modifie une donnée visible dans l'UI DOIT émettre l'event correspondant.
   Pattern à vérifier après chaque fix : existe-t-il un hook qui écoute cet event ?

2. **Loading states** : Chaque formulaire avec appel API DOIT avoir `pointer-events-none opacity-50`
   sur son contenu pendant la requête. Vérifier di, dd, et tous les nouveaux formulaires.

3. **Label connectivity** : Tout texte visuel qui pointe vers un input DOIT avoir `htmlFor`/`id`.
   Pattern : `<Label htmlFor="xxx">` + `id="xxx"` sur l'input.

4. **Version numbering** : Après A2, tout code qui crée une proposal DOIT utiliser `maxVersion + 1`.
   Vérifier qu'il n'existe pas d'autre endroit où `version: 1` est hardcodé.

5. **Sort consistency** : L'option "Oldest/Newest first" doit s'appliquer à TOUS les onglets
   qui listent des items avec une date. Vérifier da (Feedback) + Activity (de).
