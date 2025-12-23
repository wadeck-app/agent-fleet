# Plan 1 : Migration Événements Frontend ↔ Backend (F↔B)

## Scope

**Uniquement** : Événements Frontend ↔ Backend (B2F)

**Format** : `b2f:[category]:[action]`

**Exemples** : `b2f:task:created`, `b2f:worker:heartbeat`

---

## Événements à Migrer (~20 événements)

### Task Events

```
'task:created'          → 'b2f:task:created'
'task:updated'          → 'b2f:task:updated'
'task:deleted'          → 'b2f:task:deleted'
'task:status_changed'   → 'b2f:task:status_changed'
'task:assigned'         → 'b2f:task:assigned'
'task:priority_changed' → 'b2f:task:priority_changed'
```

### Worker Events

```
'worker:created'          → 'b2f:worker:created'
'worker:updated'          → 'b2f:worker:updated'
'worker:deleted'          → 'b2f:worker:deleted'
'worker:status_changed'   → 'b2f:worker:status_changed'
'worker:heartbeat'        → 'b2f:worker:heartbeat'
'worker:capacity_changed' → 'b2f:worker:capacity_changed'
'worker:connected'        → 'b2f:worker:connected'
'worker:disconnected'     → 'b2f:worker:disconnected'
'worker:status'           → 'b2f:worker:status'
```

### Workspace Events

```
'workspace:created'          → 'b2f:workspace:created'
'workspace:updated'          → 'b2f:workspace:updated'
'workspace:deleted'          → 'b2f:workspace:deleted'
'workspace:status_changed'   → 'b2f:workspace:status_changed'
'workspace:quota_exceeded'   → 'b2f:workspace:quota_exceeded'
'workspace:archived'         → 'b2f:workspace:archived'
```

---

## Étapes

### 1. Modifier les Types (EventTypes.ts)

**Fichier** : `packages/shared-frontend-backend/src/transport/EventTypes.ts`

**Ligne 28** :

```typescript
// AVANT
export type ResourceEvent<Resource extends string, Data> = {
  [K in CrudEventType as `${Resource}:${K}`]: Data;
};

// APRÈS
export type ResourceEvent<Resource extends string, Data> = {
  [K in CrudEventType as `b2f:${Resource}:${K}`]: Data;
};
```

**Lignes 38-79** (BusinessEvents) :

```typescript
export interface BusinessEvents {
  'b2f:task:assigned': { ... };
  'b2f:task:priority_changed': { ... };
  'b2f:worker:heartbeat': { ... };
  'b2f:worker:capacity_changed': { ... };
  'b2f:workspace:quota_exceeded': { ... };
  'b2f:workspace:archived': { ... };
}
```

### 2. Find & Replace Backend

**Fichiers** :

- `packages/web-backend/src/services/TasksService.ts` - Commentaires
- `packages/web-backend/src/services/WorkersService.ts` - Commentaires
- `packages/web-backend/src/transport/EventBroadcaster.test.ts`
- `packages/web-backend/src/transport/integration/event-broadcasting.test.ts`
- `packages/web-backend/src/transport/adapters/WebSocketTransportServer.test.ts`
- `packages/web-backend/src/transport/adapters/MockTransportServer.ts`
- `packages/web-backend/src/controllers/MonitoringController.test.ts`

**Commandes Find & Replace** :

```
'task:created'   → 'b2f:task:created'
'task:updated'   → 'b2f:task:updated'
'worker:created' → 'b2f:worker:created'
... (tous les événements)
```

### 3. Find & Replace Frontend

**Fichiers** :

- `packages/web-frontend/src/transport/useTransport.ts`
- `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.test.ts`
- `packages/web-frontend/src/transport/adapters/MockTransportClient.test.ts`
- `packages/web-frontend/src/transport/adapters/RestTransportClient.test.ts`

**Même pattern Find & Replace**

### 4. Find & Replace Tests Partagés

**Fichiers** :

- `packages/shared-frontend-backend/src/transport/EventTypes.test.ts`
- `packages/shared-frontend-backend/src/transport/TypedTransport.test.ts`
- `packages/shared-frontend-backend/src/transport/TransportProtocol.test.ts`

### 5. Créer Constantes B2F

**Nouveau fichier** : `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts`

```typescript
export const B2F_TASK_CREATED = 'b2f:task:created' as const;
export const B2F_TASK_UPDATED = 'b2f:task:updated' as const;
export const B2F_TASK_DELETED = 'b2f:task:deleted' as const;
// ... tous les événements B2F
```

**Export** : `packages/shared-frontend-backend/src/transport/index.ts`

### 6. Remplacer String Literals par Constantes

**Backend** :

```typescript
import { B2F_TASK_CREATED } from '@app/shared-frontend-backend';

eventBroadcaster.broadcast(B2F_TASK_CREATED, task);
```

**Frontend** :

```typescript
import { B2F_TASK_CREATED } from '@app/shared-frontend-backend';

transport.subscribe(B2F_TASK_CREATED, handler);
```

### 7. Tests

```bash
npm run test
npm run check
```

---

## Fichiers Impactés

**Shared** : 6 fichiers
**Backend** : 7 fichiers
**Frontend** : 5 fichiers

**Total** : ~18 fichiers

---

## Estimation

**~1h30** (Find & Replace automatique + constantes + tests)
