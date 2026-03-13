# Plan : Ticket → Flow Pipeline

**Objectif** : L'utilisateur écrit une demande vague dans un ticket → Claude analyse le contexte (capabilities, flows précédents, feedbacks, retrospectives) → propose un flow → l'utilisateur le review inline (comme une PR GitHub) → approuve → flow exécuté automatiquement.

---

## Nouveaux concepts introduits

| Concept               | Description                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| `FlowProposal`        | Flow proposé par Claude pour un ticket, versionné (multiple itérations)               |
| `FlowReviewThread`    | Thread de commentaire inline ancré sur une sélection dans le YAML proposé             |
| `FlowReviewComment`   | Message dans un thread de review (discussion itérative)                               |
| `FlowFeedback`        | Feedback structuré de l'utilisateur après exécution (séparé des commentaires normaux) |
| `FlowRetrospective`   | Bilan structuré généré par Claude en fin de flow (dernière step)                      |
| `FlowKnowledgeBase`   | Agrégat consultable : flows utilisés + feedbacks + retrospectives + lessons learned   |
| `FlowCapabilitiesDoc` | Documentation auto-générée des capacités du flow engine (contexte pour Claude)        |
| `ProjectStatusConfig` | Statuts de ticket définis par projet (remplace l'enum global hardcodé)                |

---

## Décisions architecturales

### Statuts de ticket : configuration par projet

Supprimer le `TicketStatus` enum hardcodé du domaine partagé. Le remplacer par `string` dans les types domain. Chaque projet définit ses statuts dans une `ProjectStatusConfig` :

```ts
interface ProjectStatusConfig {
	statuses: {
		id: string; // ex: "flow_proposed"
		label: string; // ex: "Flow en attente de review"
		terminal: boolean; // ex: done, cancelled
		color?: string; // pour l'UI
	}[];
	transitions: {
		from: string;
		to: string;
		triggers?: FlowTrigger[]; // flows déclenchés par cette transition
	}[];
}
```

Les flows utilisent déjà des strings dans `statusTransitions` — ce changement est rétrocompatible.

**Fail fast** : si un statut est invalide selon la config du projet, le rejeter à la validation Fastify. Si aucune config projet → accepter tout string (mode permissif).

### Flow Proposal : entité séparée du ticket

Le ticket référence `currentFlowProposalId?: string`. Les proposals sont versionées (v1, v2...). Chaque nouvelle itération (après rejet) crée une nouvelle proposal — la précédente passe en `superseded`.

### Review inline : ancrage sur le YAML

```ts
interface FlowReviewSelector {
	startLine: number;
	endLine: number;
	startChar?: number; // pour sélection partielle sur une ligne
	endChar?: number;
	selectedText?: string; // snapshot du texte sélectionné (stabilité si YAML change entre versions)
}
```

Si le flow est révisé (nouvelle version), le `selectedText` snapshot permet de maintenir le contexte même si les numéros de ligne changent. Marquer les threads `stale` si le texte n'est plus trouvable dans la nouvelle version.

### Feedback et Retrospective : entités séparées des commentaires

Ni `FlowFeedback` ni `FlowRetrospective` ne sont des `TicketComment`. Entités propres, événements d'historique propres, sections dédiées dans l'UI.

---

## Phase 1 — Configuration des statuts par projet

### 1.1 Dé-hardcoder `TicketStatus`

- `packages/shared-orch-worker/src/domain-types.ts` : `TicketStatus` enum → `type TicketStatus = string`
- `packages/shared-frontend-backend/src/api/tickets.contract.ts` : `z.enum([...])` → `z.string()` pour le champ `status`

Garder une constante `DEFAULT_TICKET_STATUSES` (array of strings) pour les usages internes qui référencent des valeurs connues (ex: `'todo'`, `'done'`). Ne pas les supprimer, juste ne plus les imposer via l'enum.

### 1.2 Nouveau schema `ProjectStatusConfig`

**Fichier** : `packages/shared-frontend-backend/src/api/projects.contract.ts` (créer si absent, sinon ajouter)

```ts
ProjectStatusConfigSchema = z.object({
	statuses: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			terminal: z.boolean().default(false),
			color: z.string().optional(),
		})
	),
	transitions: z.array(
		z.object({
			from: z.string(),
			to: z.string(),
			triggers: z.array(FlowTriggerSchema).optional(),
		})
	),
});
```

Endpoints :

- `PUT /api/projects/:projectId/status-config`
- `GET /api/projects/:projectId/status-config`

### 1.3 Config par défaut

Fournir `DEFAULT_STATUS_CONFIG` dans `packages/shared-frontend-backend` couvrant les statuts actuels + les nouveaux nécessaires au pipeline :

Statuts à ajouter dans la config par défaut :

- `flow_analysis` — Claude est en train d'analyser (état transitoire, automatique)
- `flow_proposed` — proposal disponible, en attente de review
- `flow_approved` — approuvé, tâche créée automatiquement

---

## Phase 2 — Flow Knowledge Base

### 2.1 Modèle `FlowFeedback`

**Fichier** : `packages/shared-frontend-backend/src/api/flow-feedback.contract.ts` (nouveau)

```ts
FlowFeedbackSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	flowId: z.string(),
	taskId: z.string(),
	rating: z.number().int().min(1).max(5),
	wentWell: z.array(z.string()),
	wentWrong: z.array(z.string()),
	suggestions: z.array(z.string()).optional(),
	submittedAt: z.string(),
	author: z.string(),
});
```

Endpoints :

- `POST /api/tickets/:ticketId/feedback`
- `GET /api/flows/:flowId/feedback`

Événement history : `flow.feedback_submitted`

### 2.2 Modèle `FlowRetrospective`

Même fichier `flow-feedback.contract.ts`.

```ts
FlowRetrospectiveSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	flowId: z.string(),
	taskId: z.string(),
	wentWell: z.array(z.string()),
	wentWrong: z.array(z.string()),
	suggestions: z.array(z.string()),
	executionSummary: z.string(),
	generatedAt: z.string(),
});
```

Endpoint : `GET /api/tickets/:ticketId/retrospective`
Événement history : `flow.retrospective_generated`

### 2.3 Step `retrospective` dans le flow engine

**Fichier** : `packages/flow-engine/src/types.ts`

Nouveau type de step opt-in, à placer en dernière position dans un flow :

```ts
interface RetrospectiveFlowStep {
	type: 'retrospective';
	id: string;
	// Inputs automatiques injectés par FlowExecutor :
	//   ${{ flow.allLogs }}, ${{ flow.status }}, ${{ flow.duration }}, ${{ flow.steps }}
	// Outputs : wentWell[], wentWrong[], suggestions[], executionSummary
	// POST automatique vers /api/tickets/:ticketId/retrospective via callback
}
```

**Fichier** : `packages/flow-engine/src/executor/FlowExecutor.ts` — ajouter le handling de ce type de step.

### 2.4 Service `FlowKnowledgeService`

**Fichier** : `packages/web-backend/src/services/FlowKnowledgeService.ts` (nouveau)

```ts
class FlowKnowledgeService {
	async buildKnowledgeContext(projectId: string, ticketDescription: string): Promise<FlowKnowledgeContext>;
}

interface FlowKnowledgeContext {
	availableFlows: FlowSummary[];
	reusableSubFlows: FlowSummary[]; // flows taggés metadata.reusable: true dans le YAML
	feedbackByFlow: Record<string, AggregatedFeedback>;
	recentRetrospectives: FlowRetrospective[];
	similarTickets: SimilarTicketSummary[]; // tickets avec labels similaires + flow utilisé
}
```

---

## Phase 3 — Flow Capabilities Documentation

### 3.1 `FlowCapabilitiesGenerator`

**Fichier** : `packages/flow-engine/src/docs/FlowCapabilitiesGenerator.ts` (nouveau)

Auto-généré depuis les types TypeScript existants :

```ts
class FlowCapabilitiesGenerator {
	generate(): string; // retourne un document Markdown structuré
}
```

Contenu généré :

- Types de steps disponibles (`model`, `script`, `subflow`, `intervention`, `retrospective`) avec leurs inputs/outputs
- `VariableType` disponibles (24 types : string, number, file, enum, multi-enum, etc.)
- Syntaxe template : `${{ steps.X.outputs.Y }}`, `${{ inputs.X }}`, `${{ flow.allLogs }}`
- Workspace modes : `isolated | shared | manual`
- `StatusTransitionConfig` : `onSuccess`/`onFailure` pour ticket et task
- Types d'intervention : `approval`, `question`, `choice`

Exporter depuis `packages/flow-engine/src/index.ts`.

---

## Phase 4 — Flow Designer Agent (Claude)

### 4.1 `FlowDesignerAgent`

**Fichier** : `packages/web-backend/src/agents/FlowDesignerAgent.ts` (nouveau)

Utilise `AgentExecutor` (pattern existant dans `TicketsService`) pour appeler Claude CLI.

**Contexte injecté dans le prompt** :

1. Description du ticket (title + description + labels + fields)
2. `FlowCapabilitiesDoc` (Phase 3)
3. `FlowKnowledgeContext` (Phase 2.4)
4. En cas de re-design après rejet : proposal précédente + tous les threads de review avec leurs commentaires

**Format de sortie attendu de Claude** (JSON parsé) :

```ts
interface FlowDesignOutput {
	proposedFlow: FlowDefinition;
	reasoning: string;
	reusedFromFlowId?: string;
	reusedSubFlows?: string[];
	adaptations?: string[];
	confidenceScore?: number; // 0-100
}
```

**Validation** : passer `proposedFlow` dans `FlowValidator` avant de stocker. Fail fast si invalide — retourner les erreurs de validation dans la réponse API.

### 4.2 Déclenchement

Le `FlowDesignerAgent` est déclenché par :

- Une transition de statut configurée dans `ProjectStatusConfig.transitions[].triggers`
- Ou explicitement via `POST /api/tickets/:id/request-flow-design`

Aucun comportement hardcodé — chaque projet décide quelle transition déclenche l'analyse.

---

## Phase 5 — Flow Proposal & Review System

### 5.1 Schemas Zod

**Fichier** : `packages/shared-frontend-backend/src/api/flow-proposals.contract.ts` (nouveau)

```ts
FlowProposalStatusSchema = z.enum(['pending_review', 'approved', 'rejected', 'superseded']);

FlowReviewSelectorSchema = z.object({
	startLine: z.number().int(),
	endLine: z.number().int(),
	startChar: z.number().int().optional(),
	endChar: z.number().int().optional(),
	selectedText: z.string().optional(),
});

FlowReviewCommentSchema = z.object({
	id: z.string(),
	threadId: z.string(),
	content: z.string(),
	author: z.string(),
	createdAt: z.string(),
});

FlowReviewThreadSchema = z.object({
	id: z.string(),
	proposalId: z.string(),
	selector: FlowReviewSelectorSchema,
	status: z.enum(['open', 'resolved', 'stale']),
	comments: z.array(FlowReviewCommentSchema),
	createdAt: z.string(),
	resolvedAt: z.string().optional(),
});

FlowProposalSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	version: z.number().int(),
	status: FlowProposalStatusSchema,
	proposedFlow: FlowDefinitionSchema,
	reasoning: z.string(),
	reusedFromFlowId: z.string().optional(),
	reusedSubFlows: z.array(z.string()).optional(),
	adaptations: z.array(z.string()).optional(),
	confidenceScore: z.number().optional(),
	reviewThreads: z.array(FlowReviewThreadSchema),
	proposedAt: z.string(),
	approvedAt: z.string().optional(),
	rejectedAt: z.string().optional(),
});
```

### 5.2 Champs ajoutés au ticket

Dans `packages/shared-frontend-backend/src/api/tickets.contract.ts` :

```ts
currentFlowProposalId: z.string().optional(),
flowFeedbackId: z.string().optional(),
flowRetrospectiveId: z.string().optional(),
```

### 5.3 Nouveaux `TicketHistoryEvent`

Ajouter dans l'enum/union existant :

- `flow.design_requested`
- `flow.proposed` (data: version, flowId)
- `flow.review_comment_added` (data: threadId, selector)
- `flow.review_thread_resolved` (data: threadId)
- `flow.approved` (data: proposalId, version)
- `flow.rejected` (data: proposalId, version)
- `flow.feedback_submitted`
- `flow.retrospective_generated`

### 5.4 Endpoints

**Fichier** : `packages/web-backend/src/controllers/FlowProposalsController.ts` (nouveau)

```
POST   /api/tickets/:ticketId/request-flow-design
         → déclenche FlowDesignerAgent, crée FlowProposal v1
         → ticket passe en flow_proposed

GET    /api/tickets/:ticketId/flow-proposals
         → liste toutes les proposals (toutes versions)

GET    /api/tickets/:ticketId/flow-proposals/:proposalId
         → détail complet : YAML + reasoning + review threads

POST   /api/tickets/:ticketId/flow-proposals/:proposalId/approve
         → status proposal → approved, ticket → flow_approved
         → sauvegarde le flow dans flows-custom.yml via FlowRegistry.saveCustomFlow()
         → crée la Task (déclenche la logique existante dans TicketsService)

POST   /api/tickets/:ticketId/flow-proposals/:proposalId/reject
         → status proposal → rejected
         → re-déclenche FlowDesignerAgent avec les threads de review comme contexte additionnel
         → crée une nouvelle proposal (version N+1), l'ancienne → superseded

POST   /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads
         body: { selector: FlowReviewSelector, comment: string }
         → crée un thread avec le premier commentaire

POST   /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments
         body: { content: string }
         → ajoute un commentaire dans un thread (discussion)

PATCH  /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId
         body: { status: 'resolved' }
         → résout un thread
```

### 5.5 Contexte de re-design (après rejet)

Lors du rejet, `FlowDesignerAgent` reçoit en contexte additionnel :

- Le YAML de la proposal rejetée
- Tous les threads de review (selector + selectedText + commentaires complets)
- Le reasoning de la version précédente

### 5.6 `FlowRegistry.saveCustomFlow()`

**Fichier** : `packages/flow-engine/src/registry/FlowRegistry.ts`

```ts
async saveCustomFlow(flow: FlowDefinition): Promise<void>
// Sérialise en YAML (js-yaml) et ajoute/remplace dans flows-custom.yml
// Utiliser un lock fichier pour éviter les écritures concurrentes
// Fail fast si le fichier n'est pas accessible en écriture
```

---

## Phase 6 — Frontend UI

> Déléguer entièrement à l'agent `frontend-dev` avec les contrats Zod de Phase 1/2/5 en entrée.

### 6.1 Feature `flow-proposal`

`packages/web-frontend/src/app/features/flow-proposal/`

- `FlowProposalPanel.tsx` — panel principal dans la vue ticket
    - Bouton "Analyser et proposer un flow" si pas encore de proposal
    - Spinner pendant `flow_analysis`

- `FlowProposalViewer.tsx` — YAML du flow proposé avec :
    - Coloration syntaxique + numéros de ligne
    - Sélection de texte (line/range/partial) → ouvre un nouveau thread de review
    - Indicateurs visuels des threads en marge (comme GitHub PR)

- `FlowReviewThreadPanel.tsx` — threads de review :
    - Discussion dans chaque thread
    - Bouton "Résoudre" par thread
    - Badge `stale` si le texte n'est plus trouvable dans la version courante

- `FlowProposalHeader.tsx` — reasoning + version + confidence score + reused flows
- `FlowProposalActions.tsx` — Approuver / Rejeter + historique des versions (v1, v2...)

### 6.2 Feature `flow-feedback`

`packages/web-frontend/src/app/features/flow-feedback/`

- `FlowFeedbackForm.tsx` — apparaît quand le flow est terminé
    - Rating 1-5, champs `wentWell[]` / `wentWrong[]`

- `FlowRetrospectiveCard.tsx` — section dédiée dans la vue ticket (collapsible, séparée des commentaires)

### 6.3 Intégration dans la vue ticket

Sections dédiées (séparées des commentaires) :

- "Flow Proposal" — si `currentFlowProposalId` défini
- "Feedback" — si flow complété et feedback pas encore soumis
- "Retrospective agent" — si générée

---

## Phase 7 — Tests ✅ BACKEND COMPLETE

### Backend (unitaire) — DONE 2026-03-13

| Fichier | Tests |
|---|---|
| `FlowDesignerAgent.test.ts` | 9 |
| `FlowKnowledgeService.test.ts` | 9 |
| `FlowProposalsService.test.ts` | 11 |
| `FlowFeedbackService.test.ts` | 8 |
| `ProjectsService.statusConfig.test.ts` | 8 |
| `TicketsController.test.ts` | 37 |
| `FlowFeedbackController.test.ts` | 9 |
| `FlowFeedbackRepository.test.ts` | 20 |
| `FlowProposalsRepository.test.ts` | 12 |
| `ProjectsController.test.ts` | 27 |

Bugs fixes dans ce cycle :
- `FlowProposalsRepository.create()` : version proposal ecrasee par BaseEntity.version (regression test ajoutee)
- `FlowProposalsService.getProposals()` : tri secondaire par proposedAt
- `FlowProposalSection` : confidence score x100 corrige
- `FlowProposalSection` : onTicketRefresh pour sync statut apres approve/reject

Manquant (hors scope) : `FlowsController.test.ts` (5 routes)

### Frontend — TODO

- `FlowProposalSection` Storybook + tests
- Hooks : `useFlowProposals`, `useProjectStatusConfig`

### Couverture cible — atteinte

- Nouveaux services : 90%+
- Nouveaux controllers : 70%+

---

## Ordre d'exécution

```
Phase 1 (statuts par projet)           ← prérequis pour Phase 4+
Phase 2 data models                    ← indépendant, parallélisable
Phase 3 (capabilities doc)             ← indépendant, parallélisable

Phase 4 (FlowDesignerAgent)            ← après Phase 1 + 3
Phase 5 schemas Zod                    ← après Phase 1 + 2

Phase 5 endpoints + service            ← après Phase 4 + 5 schemas
Phase 7 tests backend                  ← après Phase 5 endpoints

Phase 6 frontend                       ← après Phase 5 schemas (déléguer frontend-dev)
Phase 7 tests frontend                 ← après Phase 6
```

---

## Fichiers à toucher (résumé)

| Fichier                                                               | Action                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/shared-orch-worker/src/domain-types.ts`                     | `TicketStatus` enum → `type TicketStatus = string`           |
| `packages/shared-frontend-backend/src/api/tickets.contract.ts`        | `z.enum` → `z.string()` pour status + nouveaux champs ticket |
| `packages/shared-frontend-backend/src/api/projects.contract.ts`       | Ajouter `ProjectStatusConfig`                                |
| `packages/shared-frontend-backend/src/api/flow-proposals.contract.ts` | Nouveau fichier                                              |
| `packages/shared-frontend-backend/src/api/flow-feedback.contract.ts`  | Nouveau fichier                                              |
| `packages/flow-engine/src/types.ts`                                   | Ajouter step type `retrospective`                            |
| `packages/flow-engine/src/executor/FlowExecutor.ts`                   | Gérer step `retrospective`                                   |
| `packages/flow-engine/src/docs/FlowCapabilitiesGenerator.ts`          | Nouveau fichier                                              |
| `packages/flow-engine/src/index.ts`                                   | Exporter `FlowCapabilitiesGenerator`                         |
| `packages/flow-engine/src/registry/FlowRegistry.ts`                   | Ajouter `saveCustomFlow()`                                   |
| `packages/web-backend/src/services/FlowKnowledgeService.ts`           | Nouveau fichier                                              |
| `packages/web-backend/src/agents/FlowDesignerAgent.ts`                | Nouveau fichier                                              |
| `packages/web-backend/src/controllers/FlowProposalsController.ts`     | Nouveau fichier                                              |
| `packages/web-backend/src/services/TicketsService.ts`                 | Intégrer trigger flow design + approve → create task         |
| `packages/web-backend/src/routes.ts`                                  | Enregistrer `FlowProposalsController`                        |
| `packages/web-frontend/src/app/features/flow-proposal/`               | Nouveau module (déléguer frontend-dev)                       |
| `packages/web-frontend/src/app/features/flow-feedback/`               | Nouveau module (déléguer frontend-dev)                       |
| `.agent-fleet/flows-custom.yml`                                       | Créer si absent                                              |

---

## Risques

- **`TicketStatus` string** : tout code qui compare `status === 'todo'` reste fonctionnel via les constantes `DEFAULT_TICKET_STATUSES`. Ne pas casser l'existant.
- **Threads `stale`** : si le flow est révisé, repositionner les threads via `selectedText` diff. Sinon les marquer `stale` plutôt que les supprimer.
- **`FlowDesignerAgent` prompt quality** : la qualité des proposals dépend du contexte fourni. Prévoir un mode debug qui log le prompt complet.
- **Concurrence sur `flows-custom.yml`** : lock fichier ou queue pour les écritures parallèles.
- **Step `retrospective` opt-in** : ne pas impacter les flows existants dans `flows.yml`.
