# Plan: Permalinks + Traceability + Ticket Page Designs

**Date:** 2026-03-01  **Branch:** ws2

---

## Context

Two features to implement + a design discussion for the ticket detail page:

1. **Comment permalinks** — URL `#comment-:id`, timestamp cliquable, highlight au chargement
2. **Traceability bidirectionnelle** — savoir quel event a déclenché quel flow, depuis la task ET depuis le ticket

---

## Feature 1 — Comment Permalinks

### URL format
`/tickets/:ticketId#comment-:commentId` — cohérent avec `#log-{logId}` dans `useLogSelection.ts`.

### Scroll + highlight au chargement
**`packages/web-frontend/src/app/pages/tickets/TicketCommentsSection.tsx`**

`useEffect` après chargement des commentaires (dépendance `[comments]`) :
```typescript
const hash = window.location.hash; // '#comment-abc123'
if (!hash.startsWith('#comment-')) return;
const targetId = hash.slice('#comment-'.length);
const el = document.getElementById(`comment-${targetId}`);
if (!el) return;
el.scrollIntoView({ behavior: 'smooth', block: 'center' });
el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 3000);
```

Chaque `<div>` commentaire reçoit `id={`comment-${comment.id}`}`.

### Timestamp cliquable (approche choisie : Jira/Slack style)
```tsx
// State local
const [copiedId, setCopiedId] = useState<string | null>(null);

// Dans chaque commentaire :
<button
    title={copiedId === comment.id ? 'Copied!' : 'Click to copy link to this comment'}
    className="text-xs text-muted-foreground hover:underline cursor-pointer"
    onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
        void navigator.clipboard.writeText(url);
        setCopiedId(comment.id);
        setTimeout(() => setCopiedId(null), 2000);
    }}
>
    {formatRelativeTime(comment.createdAt)}
</button>
```

Pas de lib externe — `navigator.clipboard` natif. Tooltip change "Copied!" 2s via `title`.

**Fichier modifié :** `TicketCommentsSection.tsx` uniquement

---

## Feature 2 — Traceability bidirectionnelle

### 2a. Stocker triggerEvent + promouvoir ticketId

**`packages/orchestrator/src/core/TaskManager.ts`** — ligne ~116
Promouvoir `ticketId` top-level (comme `flowId`) :
```typescript
ticketId: metadata.ticketId as string | undefined,
```

**`packages/web-backend/src/factories/DataStoreFactory.ts`**
Ajouter `triggerEvent` dans le metadata de chaque `createTask()` :
```typescript
// ticket.created listener (~ligne 630)
{ flowId: sub.flowId, projectId: payload.projectId, ticketId: payload.ticketId, triggerEvent: 'ticket.created' }

// ticket.status.changed listener (~ligne 605)
{ flowId: sub.flowId, projectId: payload.projectId, ticketId: payload.ticketId, triggerEvent: 'ticket.status.changed' }

// ticket.comment_added listener (à créer dans comments-v2 plan)
{ flowId: sub.flowId, projectId: payload.projectId, ticketId: payload.ticketId, triggerEvent: 'ticket.comment_added' }
```

### 2b. Filtrer tasks par ticketId

**`packages/shared-frontend-backend/src/api/tasks.contract.ts`**
Ajouter dans `TasksListQuerySchema` :
```typescript
ticketId: z.string().optional(),
```

**`packages/web-backend/src/services/TasksService.ts`**
Après `findAll()`, filtrer sur le champ top-level (pas de metadata scan) :
```typescript
if (query.ticketId) {
    tasks = tasks.filter(t => t.ticketId === query.ticketId);
}
```

### 2c. Task detail — badge "Triggered by"

**`packages/web-frontend/src/app/pages/tasks/components/TaskInfoPanel.tsx`** — après section "Flow ID" (~ligne 95)

```tsx
{task.ticketId && (
    <div>
        <span className="text-xs text-muted-foreground">Triggered by</span>
        <div className="flex items-center gap-2 mt-1">
            {task.metadata?.triggerEvent && (
                <Badge variant="outline" className="font-mono text-xs">
                    {task.metadata.triggerEvent as string}
                </Badge>
            )}
            <Link to={`/tickets/${task.ticketId}`} className="text-xs text-primary hover:underline">
                → Ticket {task.ticketId}
            </Link>
        </div>
    </div>
)}
```

### 2d. Ticket detail — section "Triggered Tasks"

Nouveau composant : `packages/web-frontend/src/app/pages/tickets/TriggeredTasksSection.tsx`

- Fetch : `GET /api/tasks?ticketId=:ticketId` via `tasksApi.getTasksList({ ticketId })`
  (`tasksApi` est importé depuis `../tasks/tasks.api`)
- Refresh RT : `useRealtimeRefresh` sur `B2F_TASKS_UPDATED` (aggregate, pas besoin de filtre)
- Affiche par task : `flowId` · badge `triggerEvent` · status badge · timestamp · lien `/tasks/:id`

**`packages/web-frontend/src/app/pages/tickets/TicketDetailPage.tsx`**
Remplacer la section "Linked Tasks" (lignes 501–518, affiche `ticket.taskIds` vides/IDs bruts)
par `<TriggeredTasksSection ticketId={id!} />`.

> **Note:** `ticket.taskIds` est une liste de tasks manuellement liées (différent des tasks auto-déclenchées). Si les deux concepts coexistent, renommer "Linked Tasks" → "Triggered Tasks" et conserver. Vérifier avec `tasksApi.getTasksList({ ticketId })` si des tasks existent — si aucune, afficher "No triggered tasks yet".

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `packages/orchestrator/src/core/TaskManager.ts` | Promouvoir `ticketId` top-level |
| `packages/web-backend/src/factories/DataStoreFactory.ts` | Ajouter `triggerEvent` dans metadata |
| `packages/shared-frontend-backend/src/api/tasks.contract.ts` | Ajouter `ticketId` query param |
| `packages/web-backend/src/services/TasksService.ts` | Filter tasks par `ticketId` |
| `packages/web-frontend/src/app/pages/tasks/components/TaskInfoPanel.tsx` | Section "Triggered by" |
| `packages/web-frontend/src/app/pages/tickets/TicketDetailPage.tsx` | Remplacer Linked Tasks |
| `packages/web-frontend/src/app/pages/tickets/TriggeredTasksSection.tsx` | Nouveau composant |

---

## Feature 3 — Ticket Detail : 6 layouts comparables

> Toutes les variantes sont implémentées sur la **même route** `/tickets/:id`
> via un query param `?layout=a|b|c|d|e|f` + un layout switcher persistent (localStorage).
> L'utilisateur switche entre les variantes en temps réel avec les données réelles du ticket.

### Architecture

```
TicketDetailPage.tsx
  ├── LayoutSwitcher.tsx          ← boutons A-F, persiste choix dans localStorage
  ├── TicketDetailLayoutA.tsx     ← Jira : deux colonnes
  ├── TicketDetailLayoutB.tsx     ← GitHub Issues : header + colonne + sidebar
  ├── TicketDetailLayoutC.tsx     ← YouTrack : onglets
  ├── TicketDetailLayoutD.tsx     ← Linear : pleine largeur
  ├── TicketDetailLayoutE.tsx     ← GitLab : timeline unifiée
  └── TicketDetailLayoutF.tsx     ← AI mode : side panel commentaires
```

Chaque layout reçoit les mêmes props : `ticket`, `comments`, et les handlers (onSave, onAddComment).
Le fetch des données reste dans `TicketDetailPage` — il est partagé.

`LayoutSwitcher` : une barre de 6 boutons compacts (A/B/C/D/E/F) en haut de page, labels au hover ("Jira", "GitHub", "YouTrack", "Linear", "GitLab", "AI mode").

### 6ème variante : Option F — AI Mode (side panel)

```
┌─────────────────────────────────────────┬────────────────────────┐
│  Fix race condition in payment flow      │ 🤖 AI Assistant        │
│  [○ Todo ▾]  [Medium ▾]  [+ Label]      │ ─────────────────────  │
│  ──────────────────────────────────      │ [worker-ai] just now   │
│                                          │ **Complexity: high**   │
│  Description                             │ - Key factors: ...     │
│  ──────────────────────────────          │                        │
│  There is a race condition...            │ [user] 3 min ago       │
│                                          │ Can you elaborate?     │
│  Custom Fields ▾                         │                        │
│  Sub-tickets ▾                           │ [worker-ai] 1 min ago  │
│                                          │ The locking mechanism  │
│  Triggered Tasks                         │ requires...            │
│  ● analyze-complexity ✓                  │ ─────────────────────  │
│  ● respond ⟳                             │ ┌──────────────────┐   │
│                                          │ │ Reply to AI...   │   │
│                                          │ └──────────────────┘   │
│                                          │ [Send]                 │
└─────────────────────────────────────────┴────────────────────────┘
```
**Concept :** Le contenu ticket à gauche (lecture/édition) + le fil de conversation IA à droite (panel fixe). Comme Cursor AI sidebar mais pour un ticket. Les commentaires `worker-ai` et `user` sont dans le panel droit ; les triggered tasks dans le contenu gauche.

### Données partagées entre layouts

| Prop | Source | Utilisée par |
|------|--------|-------------|
| `ticket` | `ticketsApi.getTicketById(id)` | Tous |
| `comments` | `ticketsApi.getComments(id)` | Tous |
| `triggeredTasks` | `tasksApi.getTasksList({ ticketId: id })` | A, B, D, E, F |
| `onSave(fields)` | handler | Tous |
| `onAddComment(content)` | handler | Tous |

### Route et persistence

URL : `/tickets/:id?layout=a` (default: `d` pour Linear)
Persistence : `localStorage.setItem('ticketDetailLayout', layout)` — switcher lit ce storage au montage.

### Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `TicketDetailPage.tsx` | Lire `?layout`, passer props aux layouts, intégrer `LayoutSwitcher` |
| `LayoutSwitcher.tsx` | Nouveau — 6 boutons, persistence localStorage |
| `TicketDetailLayoutA.tsx` | Nouveau — Jira deux colonnes |
| `TicketDetailLayoutB.tsx` | Nouveau — GitHub Issues |
| `TicketDetailLayoutC.tsx` | Nouveau — YouTrack onglets |
| `TicketDetailLayoutD.tsx` | Nouveau — Linear (reprend l'existant) |
| `TicketDetailLayoutE.tsx` | Nouveau — GitLab timeline |
| `TicketDetailLayoutF.tsx` | Nouveau — AI mode side panel |

---

## Design Reference — 5 variantes originales + F

### A — Jira : deux colonnes contenu / sidebar (60/40)

```
┌──────────────────────────────────────┬───────────────────────────┐
│  Description                         │  Status     [Todo ▾]      │
│  ─────────────────────────────────   │  Priority   [Medium ▾]    │
│  There is a race condition when...   │  Labels     [+ Add]       │
│                                      │                           │
│  Comments (2)                        │  Custom Fields            │
│  ─────────────────────────────────   │  key   value   [+ Add]    │
│  [worker-ai] <just now>              │                           │
│  **Complexity: high**...             │  Triggered Tasks          │
│                                      │  ● analyze-complexity     │
│  [user] <3 min ago>                  │    ticket.created · ✓     │
│  Can you elaborate?                  │                           │
│                                      │  Sub-tickets              │
│  [Write a reply...]         [Send]   │  (none)                   │
└──────────────────────────────────────┴───────────────────────────┘
```
**Pros :** Metadata toujours visible, pattern très reconnu.
**Cons :** Peu de place pour description longue. Sidebar peut devenir longue avec custom fields.

---

### B — GitHub Issues : header statut + colonne + sidebar

```
│  Fix race condition in payment flow                    [Edit] [🗑]│
│  ○ Todo · 2 days ago · 2 comments · analyze ✓                    │
│  ──────────────────────────────────────────────────────────      │
│  ┌─────────────────────────────────┐  ┌────────────────────┐    │
│  │  Description                    │  │ Status  [Todo ▾]   │    │
│  │  There is a race condition...   │  │ Labels  [+ Edit]   │    │
│  │                                 │  │ Custom Fields ▾    │    │
│  ├─────────────────────────────────┤  │ Triggered Tasks ▾  │    │
│  │  Activity                       │  │  analyze · ✓       │    │
│  │  ⚡ ticket-analyze triggered     │  │  respond · ⟳       │    │
│  │  [worker-ai]  <just now>        │  │ Sub-tickets ▾      │    │
│  │  **Complexity: high**...        │  └────────────────────┘    │
│  │  [user]  <3 min ago>            │                            │
│  │  Can you elaborate?             │                            │
│  │  [Write a reply...]    [Send]   │                            │
│  └─────────────────────────────────┘                            │
```
**Pros :** Header résumé lisible. Activity stream mélange events + commentaires (contexte riche).
**Cons :** Fusionner events système + commentaires demande plus de travail backend.

---

### C — YouTrack : header compact + onglets

```
│  AF-42  Fix race condition in payment flow          [Todo ▾] [🗑]│
│  ────────────────────────────────────────────────────────────    │
│  [Description] [Comments (2)] [Triggered (1)] [Sub-tickets]     │
│  ────────────────────────────────────────────────────────────    │
│                                                                  │
│  (onglet actif: Description)                                     │
│                                                                  │
│  Title      Fix race condition in payment flow      [edit]       │
│  Status     [Todo ▾]     Priority  [Medium ▾]                   │
│  Labels     [+ Add]                                              │
│  Description                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ There is a race condition when two concurrent requests...│   │
│  └──────────────────────────────────────────────────────────┘   │
│  Custom Fields                                  [+ Add Field]    │
```
**Pros :** Très compact, zero scroll. Navigation rapide entre sections par onglets.
**Cons :** Commentaires et triggered tasks cachés — pas idéal pour workflow conversationnel.

---

### D — Linear : pleine largeur, sections rétractables ⭐ Recommandé

```
│  ← Tickets                                                       │
│                                                                  │
│  Fix race condition in payment flow                              │
│  [○ Todo ▾]  [Medium ▾]  [+ Label]       analyze ✓ ⚡          │
│  ────────────────────────────────────────────────────────────   │
│                                                                  │
│  There is a race condition when two concurrent requests try      │
│  to update the same payment record...                            │
│                                                                  │
│  ▸ Custom Fields                                                 │
│  ▸ Sub-tickets                                                   │
│  ▸ Triggered Tasks (2)                                           │
│  ────────────────────────────────────────────────────────────   │
│  Comments                                                        │
│  [worker-ai]  <just now>                                         │
│  **Complexity: high** — Key factors: ...                         │
│                                                                  │
│  [user]  <3 min ago>                                             │
│  Can you elaborate?                                              │
│                                                                  │
│  ┌──────────────────────────────────────┐                        │
│  │ Write a reply...                     │           [Send]       │
│  └──────────────────────────────────────┘                        │
```
**Pros :** Maximum de place pour description et commentaires. Épuré. Sections secondaires masquées par défaut.
**Cons :** Metadata (status, priority) moins visible — requiert un regard sur les chips du header.

---

### E — GitLab : timeline unifiée commentaires + events système

```
│  Fix race condition in payment flow                    [Edit] [🗑]│
│  ┌──────────────────────────────────┐  ┌───────────────────────┐ │
│  │ Description                      │  │ Status  [Todo ▾]      │ │
│  │ There is a race condition...     │  │ Labels  [+ Add]       │ │
│  │ [edit]                           │  │ Custom Fields ▾       │ │
│  └──────────────────────────────────┘  │ Triggered Tasks       │ │
│                                        │  ● analyze ✓ done     │ │
│  ─ Timeline ──────────────────────     │  ● respond ⟳ running │ │
│                                        └───────────────────────┘ │
│  ⚡ ticket-analyze-complexity  <2s>                              │
│     Triggered by ticket.created  [↗ open task]                  │
│                                                                  │
│  💬 worker-ai  <just now>                                        │
│     **Complexity: high** — Key factors: ...                      │
│                                                                  │
│  ⚡ ticket-comment-respond  running                              │
│     Triggered by ticket.comment_added  [↗ open task]            │
│                                                                  │
│  💬 user  <3 min ago>                                            │
│     Can you elaborate on the locking mechanism?                  │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │ Write a reply...                         │       [Send]      │
│  └──────────────────────────────────────────┘                   │
```
**Pros :** Timeline unifiée = traçabilité maximale et naturelle. On voit exactement quand le worker s'est déclenché par rapport aux commentaires.
**Cons :** Plus complexe à implémenter (events système dans le stream commentaires).

---

**Ma recommandation : Option D (Linear) pour la prochaine PR.**
Simple à implémenter, met en avant la conversation avec le worker, sections secondaires sans bruit visuel. Option E est plus puissante pour la traçabilité mais demande plus de travail.

---

## Ordre d'implémentation

```
Step 1 — Backend (main agent, pas de frontend):
    TaskManager.ts         → promouvoir ticketId top-level
    DataStoreFactory.ts    → ajouter triggerEvent dans metadata
    tasks.contract.ts      → ajouter ticketId query param
    TasksService.ts        → filter par ticketId

Step 2 — Frontend (frontend-dev agent, après Step 1 green check):
    TicketCommentsSection.tsx   → permalink (timestamp + scroll + highlight)
    TaskInfoPanel.tsx           → "Triggered by" section
    TriggeredTasksSection.tsx   → nouveau composant (fetch + RT)
    TicketDetailPage.tsx        → intégrer TriggeredTasksSection

Step 3 — Tests:
    npm run check
    npm run test:agent -- --exclude="E2E*"
    Browser: créer ticket → Triggered Tasks apparaît → cliquer timestamp → URL #comment-x
             → reload → scroll + highlight 3s
```

---

## Vérification end-to-end

1. Créer un ticket → section "Triggered Tasks" affiche `ticket-analyze-complexity` avec badge `ticket.created` + ✓
2. Cliquer sur la task → badge "Triggered by: ticket.created → Ticket XYZ" avec lien retour
3. Cliquer le timestamp d'un commentaire → URL = `…#comment-abc123`, tooltip "Copied!"
4. Recharger cette URL → scroll automatique + ring highlight 3s
5. Poster un commentaire user → `ticket-comment-respond` apparaît dans Triggered Tasks
