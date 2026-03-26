# Plan — Ticket Workflow: Status-Driven Approval

**Date:** 2026-03-24
**Type:** Brainstorm / Fork proposal
**Contexte:** Aujourd'hui le workflow nécessite des actions manuelles (demander le flow design,
naviguer entre les onglets). Ce plan explore deux approches pour l'automatiser via le statut.

---

## Workflow cible (approche A — Status as approval mechanism)

```
Ticket créé (open)
    ↓ automatique
plan-in-progress   ← worker-ai:ticket-intake génère le plan
    ↓ WS push → tab "Plan" affiché en review
plan-in-review     ← user voit le plan, peut commenter
    ↓ user clique "Approve plan"
flow-in-progress   ← flow design demandé automatiquement
    ↓ WS push → tab "Flow" affiché en review
flow-in-review     ← user voit le flow proposal, peut rejeter/commenter
    ↓ user clique "Approve flow"
executing          ← flow lancé
    ↓
done
```

Le statut **est** le mécanisme d'approbation. L'utilisateur n'a pas de bouton "Request flow design"
— il approuve le plan et le système fait le reste.

---

## Approche A — Status-driven (fork du système actuel)

### Statuts à ajouter (dans `ProjectStatusConfig`)

```
plan-in-progress   (système, lecture seule)
plan-in-review     (user → peut approuver ou demander révision)
flow-in-progress   (système, lecture seule)
flow-in-review     (user → peut approuver ou rejeter)
executing          (système, lecture seule)
done
```

### Frontend — changements UX

**TicketDetailLayoutG :**

- Si status = `plan-in-progress` : afficher un banner "Plan being generated..." avec spinner
- Si status = `plan-in-review` : afficher le plan (commentaire ticket-intake) en premier plan
  avec bouton **"Approve plan →"** prominent (pas dans un onglet enterré)
- Si status = `flow-in-progress` : banner "Flow design being generated..."
- Si status = `flow-in-review` : afficher le flow proposal en premier plan avec
  **"Approve flow →"** / **"Reject"** prominent
- Les onglets "Comments" et "Flow Design" restent accessibles mais ne sont plus le point d'entrée

**Bouton "Approve plan" :**

- `PATCH /api/tickets/:id` → `{ status: 'flow-in-progress' }`
- Backend listener sur ce changement de statut → déclenche `FlowDesignerAgent` automatiquement

### Backend — changements

**`TicketsService` / hooks de statut :**

```ts
// Quand status passe à "flow-in-progress" → trigger flow design automatiquement
if (newStatus === 'flow-in-progress') {
	await flowProposalsService.requestFlowDesign(ticketId, { triggeredByStatusChange: true });
}
```

**`FlowProposalsService.requestFlowDesign` :**

- Quand le flow arrive et status = `flow-in-progress` → passer à `flow-in-review` automatiquement

**`FlowProposalsService.approveProposal` :**

- En plus de `status: 'approved'` sur la proposal → passer le ticket à `executing`

### Avantages

- Workflow linéaire, pas d'ambiguïté sur "où en est-on"
- Le statut est visible sur la liste des tickets → visibilité immédiate
- Moins de clicks : approve plan → flow arrive → approve flow → exécution
- Compatible avec le système de statuts configurable existant (string-based `TicketStatus`)

### Inconvénients

- Couplage fort entre statuts et logique métier
- Statuts moins génériques (spécifiques au workflow plan→flow)
- Si l'user veut sauter l'étape plan (ticket simple) → UX à gérer (bypass ?)
- Migration des tickets existants avec d'autres statuts

---

## Approche B — Feature unifiée "Plan → Flow" (pas de changement de statuts)

Au lieu de deux onglets séparés (Comments pour le plan, Flow Design pour le flow), créer une
**feature unifiée** dans un seul onglet qui gère toute la progression.

### Concept

```
Onglet "Pipeline" (remplace ou complète Comments + Flow Design)
├── Step 1: Action Plan
│   ├── Contenu : commentaire worker-ai:ticket-intake (markdown rendu)
│   ├── État : pending | in-review | approved
│   └── Actions : "Approve" | "Request revision" (textarea inline)
│
└── Step 2: Flow Design  (visible seulement si plan approved)
    ├── Contenu : FlowProposal card (graphe + reasoning + questions)
    ├── État : pending | in-review | approved | rejected
    └── Actions : "Approve" | "Reject" (avec raison inline)
```

### Variante B1 — Wizard steps (progression horizontale)

```
[1. Plan] ──> [2. Flow Design] ──> [3. Execution]
   ✓ approved    in-review
```

Barre de progression en haut de l'onglet. Step 1 collapsed quand approved, Step 2 highlighted.

### Variante B2 — Timeline verticale

Chaque étape du pipeline est une carte dans un feed vertical (comme un PR review flow) :

```
─── Action Plan (approved 2h ago) ───────── [collapsed]
─── Flow Design v1 (rejected) ───────────── [collapsed, with reason]
─── Flow Design v2 (in-review) ──────────── [OPEN — approve/reject]
```

Les versions précédentes restent visibles, collapsed, pour l'historique.

### Variante B3 — Feature séparée (plus propre architecturalement)

Un composant `PipelineFeature` totalement indépendant de Comments et Flow Design existants :

- Ses propres hooks, son propre état local
- Composé de `PlanStep` + `FlowStep` + `ExecutionStep`
- Peut être testé isolément
- Peut être activé/désactivé par feature flag

### Avantages de B

- Plus flexible : pas de dépendance aux statuts du ticket
- Historique visible (versions de flow rejetées, revisions du plan)
- Extensible : ajouter un step "Testing", "Review", etc.
- Séparation claire entre le "pipeline" et les "discussions" (Comments reste pour les échanges libres)

### Inconvénients de B

- Plus de travail frontend (nouveau composant complexe)
- Le statut du ticket ne reflète plus directement l'étape pipeline
- Moins visible sur la liste des tickets (pas d'indication "flow in review")

---

## Comparaison

| Critère                      | Approche A (statuts)       | Approche B (feature)      |
| ---------------------------- | -------------------------- | ------------------------- |
| Effort backend               | Moyen (hooks statut)       | Faible                    |
| Effort frontend              | Faible (banners + boutons) | Élevé (nouveau composant) |
| Visibilité sur liste         | ✅ statut visible          | ❌ opaque depuis la liste |
| Flexibilité                  | ❌ statuts couplés         | ✅ découplé               |
| Historique des versions      | Partiel                    | ✅ natif (B2/B3)          |
| Bypass possible              | Difficile                  | Facile                    |
| Compatible tickets existants | Migration nécessaire       | ✅ additive               |

---

## Recommandation

**Court terme :** Approche A partiellement — ajouter le déclenchement automatique du flow quand
le plan est approuvé (hook sur `plan-in-review → flow-in-progress`), sans toucher aux onglets.
Ce seul changement élimine l'étape manuelle "demander le flow design".

**Moyen terme :** Approche B3 — feature pipeline séparée, affichée en tête de l'onglet "Flow Design"
actuel, qui remplace les deux boutons "Request" / "Approve" par un wizard steps cohérent.

**Questions ouvertes :**

1. Que se passe-t-il si l'user crée un ticket qui ne nécessite pas de plan (simple bug fix) ?
   → Option : checkbox "Skip action plan" à la création
2. Les statuts `plan-in-review` etc. doivent-ils apparaître dans le dropdown de statut manuel ?
   → Probablement non — statuts système = read-only dans l'UI
3. Faut-il versionner les plans (comme les flow proposals) ?
   → Oui si l'user peut demander une révision du plan
