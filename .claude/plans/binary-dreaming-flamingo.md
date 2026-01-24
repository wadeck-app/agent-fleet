# Plan: Alternatives pour la gestion des subscriptions d'événements

## Contexte

**Système actuel:**

- Chaque événement génère un message WebSocket individuel (`subscribe`/`unsubscribe`)
- Logs verbeux pour chaque subscription (création, réception, cleanup)
- Pas de batching réel: `useRealtimeRefresh` accepte un tableau mais envoie des messages individuels au serveur
- Lors de reconnexion: chaque événement est réabonné individuellement
- Pollution des logs et des appels réseau, particulièrement visible avec des événements haute-fréquence (traces, logs)

**Exemples de pollution actuelle:**

```javascript
// Page avec 7 subscriptions → 7 messages WebSocket séparés
[Dashboard] Subscribed to event: b2f:tasks:updated
[Dashboard] Subscribed to event: b2f:workers:updated
[TasksPage] Subscribed to event: b2f:task:created
[TasksPage] Subscribed to event: b2f:task:updated
[TasksPage] Subscribed to event: b2f:task:deleted
[TaskDetailStackedPage:traces] Subscribed to event: b2f:task:trace_updated
[TaskDetailStackedPage:task] Subscribed to event: b2f:task:updated
```

## Fichiers critiques

### Frontend

- `packages/web-frontend/src/hooks/useRealtimeRefresh.ts` - Hook de subscription
- `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts` - Client WebSocket (lignes 390-422: subscribe, lignes 562-567: resubscribeAll)
- `packages/web-frontend/src/transport/ITransportClient.ts` - Interface transport

### Backend

- `packages/web-backend/src/transport/TransportSessionManager.ts` - Gestion des sessions et subscriptions
- `packages/shared-frontend-backend/src/transport/TransportProtocol.ts` - Protocole des messages

### Shared

- `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts` - Constantes d'événements

---

## Alternative 1: Batch API avec opérations (Replace/Add/Remove)

### Description

API permettant d'envoyer plusieurs événements dans un seul message avec des opérations explicites.

### Nouveau protocole

```typescript
interface BatchSubscriptionMessage {
	type: 'batch_subscription';
	operation: 'replace' | 'add' | 'remove';
	events: string[];
	filters?: Record<string, Record<string, unknown>>; // filters par événement
}
```

### Exemples d'utilisation

```typescript
// Remplacer toutes les subscriptions existantes
transport.batchSubscribe({
	operation: 'replace',
	events: ['b2f:task:created', 'b2f:task:updated', 'b2f:task:deleted'],
	filters: {
		'b2f:task:updated': { taskId: '123' },
	},
});

// Ajouter des subscriptions sans toucher aux existantes
transport.batchSubscribe({
	operation: 'add',
	events: ['b2f:worker:connected', 'b2f:worker:disconnected'],
});

// Retirer des subscriptions spécifiques
transport.batchSubscribe({
	operation: 'remove',
	events: ['b2f:task:trace:updated'],
});
```

### Modifications requises

**Frontend:**

1. Ajouter `batchSubscribe()` dans `ITransportClient`
2. Implémenter dans `WebSocketTransportClient`:
    - Nouvelle méthode `batchSubscribe(operation, events, filters)`
    - Modifier `resubscribeAll()` pour envoyer un seul message `replace`
3. Mettre à jour `useRealtimeRefresh` pour utiliser `batchSubscribe('add')`

**Backend:**

1. Ajouter handler pour `batch_subscription` dans `TransportSessionManager`
2. Implémenter la logique `replace/add/remove`:
    - `replace`: clear + add
    - `add`: merge avec existant
    - `remove`: filter existant

**Logs:**

- Un seul log par batch: `[Component] Batch subscribe (replace): 3 events`

### Avantages

✅ Réduction drastique des messages WebSocket (7 → 1 par page)
✅ API explicite et lisible
✅ Facilite le remplacement complet des subscriptions
✅ Compatible avec le système actuel (migration progressive)

### Inconvénients

❌ Nécessite de tracker les subscriptions actuelles pour `add` vs `replace`
❌ Gestion des filtres plus complexe (un filtre par événement)
❌ Migration nécessaire pour toutes les pages

---

## Alternative 2: State-based API (Declarative)

### Description

API déclarative où on déclare l'état désiré des subscriptions. Le système calcule automatiquement le diff et applique les changements.

### Nouveau protocole

```typescript
interface SubscriptionStateMessage {
	type: 'subscription_state';
	subscriptions: Array<{
		event: string;
		filters?: Record<string, unknown>;
	}>;
}
```

### Exemples d'utilisation

```typescript
// Déclarer l'état désiré (le système fait le diff automatiquement)
transport.setSubscriptionState([
	{ event: 'b2f:task:created' },
	{ event: 'b2f:task:updated', filters: { taskId: '123' } },
	{ event: 'b2f:task:deleted' },
]);

// Pour retirer des subscriptions, il suffit de ne pas les inclure
transport.setSubscriptionState([
	{ event: 'b2f:task:created' },
	// task:updated et task:deleted seront automatiquement retirés
]);
```

### Modifications requises

**Frontend:**

1. Ajouter `setSubscriptionState()` dans `ITransportClient`
2. Implémenter dans `WebSocketTransportClient`:
    - Tracker l'état désiré localement
    - Calculer le diff (nouveaux, retirés)
    - Envoyer un seul message avec l'état complet
3. Modifier `useRealtimeRefresh` pour appeler `setSubscriptionState` au lieu de `subscribe`

**Backend:**

1. Ajouter handler pour `subscription_state`
2. Remplacer complètement les subscriptions de la session par le nouvel état
3. Retourner une confirmation avec l'état appliqué

**Logs:**

- Un seul log avec diff: `[Component] Subscription state updated: +2 events, -1 event`

### Avantages

✅ API la plus simple côté composant (déclarative)
✅ Pas besoin de tracker manuellement l'état actuel
✅ Gestion automatique du cleanup
✅ Idéal pour React (état désiré = props du hook)

### Inconvénients

❌ Diff côté client peut être coûteux si beaucoup d'événements
❌ Backend doit remplacer complètement l'état à chaque appel
❌ Moins de contrôle fin sur les opérations
❌ Migration la plus importante (change le paradigme)

### **Gestion multi-composants (Critical!)**

**Problème:** Que se passe-t-il quand deux composants veulent des événements différents?

**Exemple:**

```typescript
// WorkersWidget veut:
{
	event: 'b2f:workers:updated';
}
{
	event: 'b2f:worker:connected';
}

// TasksPage veut:
{
	event: 'b2f:task:created';
}
{
	event: 'b2f:task:updated';
}
```

**Solution 1: State global fusionné (Union) - RECOMMANDÉ**

Le `WebSocketTransportClient` maintient un registre des composants et fusionne leurs états:

```typescript
// Dans WebSocketTransportClient
private componentSubscriptions = new Map<string, SubscriptionSpec[]>();

setComponentSubscriptionState(componentId: string, subscriptions: SubscriptionSpec[]): void {
  // Enregistrer l'état désiré du composant
  this.componentSubscriptions.set(componentId, subscriptions);

  // Calculer l'union de tous les composants
  const globalState = this.mergeAllComponentStates();

  // Envoyer l'état fusionné au serveur (1 seul message)
  this.sendSubscriptionStateMessage(globalState);
}

private mergeAllComponentStates(): SubscriptionSpec[] {
  const merged = new Map<string, SubscriptionSpec>();

  for (const [componentId, specs] of this.componentSubscriptions) {
    for (const spec of specs) {
      const key = this.makeSubscriptionKey(spec);
      // Fusion: garder les filtres les plus permissifs
      merged.set(key, spec);
    }
  }

  return Array.from(merged.values());
}
```

**Exemple concret:**

```typescript
// WorkersWidget mount
transport.setComponentSubscriptionState('workers-widget', [
	{ event: 'b2f:workers:updated' },
	{ event: 'b2f:worker:connected' },
]);
// → Envoie état global: [workers:updated, worker:connected]

// TasksPage mount (quelques secondes après)
transport.setComponentSubscriptionState('tasks-page', [{ event: 'b2f:task:created' }, { event: 'b2f:task:updated' }]);
// → Envoie état global: [workers:updated, worker:connected, task:created, task:updated]

// TasksPage unmount
transport.removeComponentSubscriptions('tasks-page');
// → Envoie état global: [workers:updated, worker:connected]
```

**Avantages:**

- ✅ Un seul message au serveur par changement
- ✅ Chaque composant gère son état indépendamment
- ✅ Cleanup automatique au unmount
- ✅ Pas de conflit entre composants

**Solution 2: Reference Counting**

Alternative: compter combien de composants veulent chaque événement:

```typescript
private eventRefCounts = new Map<string, number>();

incrementEventRef(event: string): void {
  const count = this.eventRefCounts.get(event) || 0;
  this.eventRefCounts.set(event, count + 1);

  if (count === 0) {
    // Premier composant à vouloir cet événement
    this.addEventToState(event);
  }
}

decrementEventRef(event: string): void {
  const count = this.eventRefCounts.get(event) || 0;
  if (count <= 1) {
    // Plus aucun composant ne veut cet événement
    this.removeEventFromState(event);
    this.eventRefCounts.delete(event);
  } else {
    this.eventRefCounts.set(event, count - 1);
  }
}
```

**Choix recommandé:** Solution 1 (State global fusionné) car plus simple et plus robuste.

---

## Alternative 3: Grouped Subscriptions API (Namespace-based)

### Description

Grouper les subscriptions par "namespace" ou "concern", avec une API de gestion par groupe.

### Nouveau protocole

```typescript
interface GroupedSubscriptionMessage {
	type: 'grouped_subscription';
	groupId: string; // e.g., "tasks-page", "task-detail-123"
	action: 'set' | 'clear';
	subscriptions: Array<{
		event: string;
		filters?: Record<string, unknown>;
	}>;
}
```

### Exemples d'utilisation

```typescript
// Définir un groupe de subscriptions
transport.subscribeGroup('tasks-page', [
	{ event: 'b2f:task:created' },
	{ event: 'b2f:task:updated' },
	{ event: 'b2f:task:deleted' },
]);

// Définir un autre groupe (n'affecte pas le premier)
transport.subscribeGroup('task-detail-123', [
	{ event: 'b2f:task:trace:updated', filters: { taskId: '123' } },
	{ event: 'b2f:task:updated', filters: { taskId: '123' } },
]);

// Retirer un groupe complet
transport.unsubscribeGroup('task-detail-123');
```

### Modifications requises

**Frontend:**

1. Ajouter `subscribeGroup()` et `unsubscribeGroup()` dans `ITransportClient`
2. Implémenter dans `WebSocketTransportClient`:
    - Tracker les groupes localement (Map<groupId, Set<event>>)
    - Sur `subscribeGroup`: remplacer les événements du groupe
    - Sur `unsubscribeGroup`: retirer tous les événements du groupe
3. Modifier `useRealtimeRefresh` pour utiliser un groupId (par défaut: composant name)

**Backend:**

1. Ajouter handler pour `grouped_subscription`
2. Tracker les subscriptions par groupe dans la session
3. Sur `action: 'set'`: remplacer les événements du groupe
4. Sur `action: 'clear'`: retirer le groupe

**Logs:**

- Un log par groupe: `[Component] Subscribed group "tasks-page": 3 events`

### Avantages

✅ Isolation parfaite entre pages/composants
✅ Cleanup très simple (un seul appel `unsubscribeGroup`)
✅ Facilite le debug (voir quels groupes sont actifs)
✅ Évite les conflits entre composants

### Inconvénients

❌ Nécessite de générer des groupIds uniques
❌ Plus complexe à implémenter (tracking par groupe)
❌ Peut créer des doublons si deux groupes s'abonnent au même événement
❌ Backend doit gérer la déduplication des événements

---

## Comparaison des alternatives

| Critère                  | Alt 1: Batch API         | Alt 2: State-based       | Alt 3: Grouped              |
| ------------------------ | ------------------------ | ------------------------ | --------------------------- |
| **Réduction messages**   | ⭐⭐⭐ 7→1 par opération | ⭐⭐⭐ 7→1 par état      | ⭐⭐⭐ 7→1 par groupe       |
| **Simplicité API**       | ⭐⭐ (3 opérations)      | ⭐⭐⭐ (déclaratif)      | ⭐⭐ (2 méthodes + groupId) |
| **Migration**            | ⭐⭐⭐ (compatible)      | ⭐ (paradigme différent) | ⭐⭐ (nouveau concept)      |
| **Isolation composants** | ⭐ (global)              | ⭐⭐ (état global)       | ⭐⭐⭐ (parfaite)           |
| **Complexité backend**   | ⭐⭐ (3 opérations)      | ⭐⭐⭐ (replace simple)  | ⭐ (tracking groupes)       |
| **Debug**                | ⭐⭐ (voir opérations)   | ⭐⭐ (voir état)         | ⭐⭐⭐ (voir groupes)       |
| **Gestion filtres**      | ⭐ (complexe)            | ⭐⭐⭐ (intégré)         | ⭐⭐⭐ (intégré)            |

---

## Impact sur les Widgets

### Widgets actuels

- **WorkersWidget** (`packages/web-frontend/src/app/components/navigation/WorkersWidget.tsx`)
    - Subscribe à: `B2F_WORKERS_UPDATED`, `B2F_WORKER_CONNECTED`, `B2F_WORKER_DISCONNECTED`
    - Pas de filtres (reçoit tous les workers)
    - Toujours monté (sidebar permanente)

- **EventDebugWidget** (`packages/web-frontend/src/app/components/navigation/EventDebugWidget.tsx`)
    - Ne crée PAS de subscriptions, observe seulement via `useTransport().subscriptions`
    - Affiche les subscriptions actives pour debug

### Modifications par alternative

#### Alternative 1: Batch API

```typescript
// WorkersWidget - Migration simple
useRealtimeRefresh({
	events: [B2F_WORKERS_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
	onEvent: fetchWorkers,
	logPrefix: 'WorkersWidget',
});

// Sous le capot: hook utilise batchSubscribe('add') au lieu de subscribe individuel
// → 1 seul message WebSocket au lieu de 3
```

**Impact:**

- ✅ Pas de changement dans l'API du hook
- ✅ Migration transparente
- ✅ Réduction de 3 messages → 1 message

#### Alternative 2: State-based API (Preferred)

```typescript
// WorkersWidget - Utilise setComponentSubscriptionState
useRealtimeRefresh({
	events: [B2F_WORKERS_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
	onEvent: fetchWorkers,
	logPrefix: 'WorkersWidget',
});

// Sous le capot:
// - Hook génère componentId automatiquement: 'WorkersWidget'
// - Appelle transport.setComponentSubscriptionState('WorkersWidget', [...])
// - Transport fusionne avec autres composants (TasksPage, etc.)
// - Envoie 1 seul message avec état global fusionné
```

**Exemple de fusion avec page:**

```typescript
// État après mount de WorkersWidget (sidebar toujours visible)
Global state: [workers:updated, worker:connected, worker:disconnected]

// TasksPage s'ouvre
Global state: [workers:updated, worker:connected, worker:disconnected, task:created, task:updated, task:deleted]
→ 1 seul message WebSocket avec delta: +3 events

// TasksPage se ferme
Global state: [workers:updated, worker:connected, worker:disconnected]
→ 1 seul message WebSocket avec delta: -3 events
```

**Impact:**

- ✅ Pas de changement dans l'API du hook
- ✅ Fusion automatique entre widgets et pages
- ✅ Widgets restent actifs pendant navigation entre pages
- ✅ Un seul message par transition de page

#### Alternative 3: Grouped API

```typescript
// WorkersWidget - Utilise groupId
useRealtimeRefresh({
	groupId: 'workers-widget', // Nouveau param!
	events: [B2F_WORKERS_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
	onEvent: fetchWorkers,
	logPrefix: 'WorkersWidget',
});

// Sous le capot: subscribeGroup('workers-widget', [...])
```

**Impact:**

- ❌ Nécessite d'ajouter `groupId` explicitement
- ✅ Isolation parfaite du widget
- ⚠️ Peut créer doublons si page et widget veulent même événement

### Recommandation pour widgets

**Alternative 2 (State-based)** est optimale pour les widgets car:

1. **Widgets persistants**: Les widgets (sidebar) restent montés pendant la navigation entre pages
2. **Fusion naturelle**: L'état du widget est fusionné avec l'état de la page active
3. **Pas de doublons**: La fusion élimine automatiquement les doublons
4. **Logs propres**: Un seul log par transition de page, pas un log par widget

**Exemple de logs avant/après:**

**Avant (système actuel):**

```
[WorkersWidget] Subscribed to event: b2f:workers:updated
[WorkersWidget] Subscribed to event: b2f:worker:connected
[WorkersWidget] Subscribed to event: b2f:worker:disconnected
[TasksPage] Subscribed to event: b2f:task:created
[TasksPage] Subscribed to event: b2f:task:updated
[TasksPage] Subscribed to event: b2f:task:deleted
→ 6 logs
```

**Après (Alternative 2):**

```
[WorkersWidget] Subscription state set: 3 events
[TasksPage] Subscription state updated: +3 events (total: 6)
→ 2 logs
```

---

## Recommandation

**Alternative 2: State-based API** est recommandée car:

1. **API la plus simple**: Approche déclarative, idéale pour React
2. **Gestion multi-composants native**: Fusion automatique entre pages et widgets
3. **Cleanup automatique**: Pas besoin de tracker manuellement l'état
4. **Logs les plus propres**: Un seul log avec delta par changement d'état
5. **Excellente pour widgets**: Gestion naturelle des composants persistants (sidebar)

**Avec la gestion multi-composants clarifiée:**

- Chaque composant déclare son état désiré indépendamment
- Le transport fusionne automatiquement tous les états (union)
- Un seul message WebSocket par changement global
- Pas de conflit entre composants

**Plan de migration:**

1. **Phase 1: Transport Layer**
    - Implémenter `setComponentSubscriptionState()` dans `WebSocketTransportClient`
    - Ajouter tracking: `componentSubscriptions: Map<string, SubscriptionSpec[]>`
    - Implémenter fusion avec `mergeAllComponentStates()`
    - Backend: handler pour `subscription_state`

2. **Phase 2: Hook Layer**
    - Modifier `useRealtimeRefresh` pour utiliser state-based API
    - Générer `componentId` automatiquement depuis `logPrefix`
    - Cleanup: appeler `removeComponentSubscriptions()` au unmount

3. **Phase 3: Migration progressive**
    - Migrer les widgets d'abord (WorkersWidget)
    - Migrer les pages simples (TasksPage)
    - Migrer les pages complexes avec filtres (TaskDetailPage)
    - Valider avec `EventDebugWidget`

4. **Phase 4: Cleanup**
    - Garder `subscribe()` individuel pour compatibilité temporaire
    - Déprécier après 100% migration
    - Supprimer code legacy

---

## Vérification

### Tests unitaires

- [ ] `WebSocketTransportClient.batchSubscribe()` - opérations replace/add/remove
- [ ] `useRealtimeRefresh` - utilise batch au lieu de subscribe individuel
- [ ] `TransportSessionManager` - handler pour `batch_subscription`

### Tests d'intégration

- [ ] Page avec 7 subscriptions → 1 seul message WebSocket
- [ ] Reconnexion → `resubscribeAll()` envoie un seul message `replace`
- [ ] Logs réduits: 1 log par batch au lieu de 1 par événement

### Vérification manuelle

1. Ouvrir Dashboard + TasksPage + TaskDetail
2. Vérifier dans Network tab: 1 message au lieu de 7
3. Vérifier logs console: 1 log par composant au lieu de 1 par événement
4. Tester reconnexion: vérifier que tout est réabonné en 1 message
5. Utiliser `EventDebugWidget` pour voir les subscriptions actives

---

## Notes d'implémentation

### Ordre des modifications

1. **Shared**: Ajouter `BatchSubscriptionMessage` dans `TransportProtocol.ts`
2. **Backend**: Implémenter handler dans `TransportSessionManager`
3. **Frontend Transport**: Ajouter `batchSubscribe()` dans client
4. **Frontend Hook**: Modifier `useRealtimeRefresh` pour utiliser batch
5. **Tests**: Ajouter tests pour nouveau protocole

### Considérations

- **Backward compatibility**: Garder `subscribe()` individuel pour compatibilité
- **Logs**: Réduire verbosité avec option `logPrefix` + level
- **Reconnexion**: `resubscribeAll()` doit utiliser batch `replace`
- **Filters**: Un filtre par événement dans le batch (Map<event, filters>)
