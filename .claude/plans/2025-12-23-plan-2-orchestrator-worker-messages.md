# Plan 2 : Migration Messages Orchestrator ↔ Worker (O↔W)

## Scope

**Uniquement** : Messages Orchestrator ↔ Worker

**Formats** :

- W2O (Worker → Orchestrator) : `w2o:[category]:[action]`
- O2W (Orchestrator → Worker) : `o2w:[category]:[action]`

**Exemples** :

- W2O : `w2o:worker:ready`, `w2o:task:started`
- O2W : `o2w:task:assign`, `o2w:worker:welcome`

---

## Messages à Migrer

### W2O (Worker → Orchestrator) - ~13 messages

```
'WORKER_READY'        → 'w2o:worker:ready'
'WORKER_HEARTBEAT'    → 'w2o:worker:heartbeat'
'REQUEST_TASK'        → 'w2o:task:request'
'TASK_STARTED'        → 'w2o:task:started'
'TASK_PROGRESS'       → 'w2o:task:progress'
'TASK_COMPLETED'      → 'w2o:task:completed'
'TASK_FAILED'         → 'w2o:task:failed'
'TASK_QUESTION'       → 'w2o:task:question'
'FLOWS_UPDATED'       → 'w2o:flows:updated'
'FLOW_STEP_STARTED'   → 'w2o:flow:step:started'
'FLOW_STEP_COMPLETED' → 'w2o:flow:step:completed'
'FLOW_STEP_FAILED'    → 'w2o:flow:step:failed'
'WORKSPACE_ALLOCATED' → 'w2o:workspace:allocated'
'WORKSPACE_RELEASED'  → 'w2o:workspace:released'
```

### O2W (Orchestrator → Worker) - ~8 messages

```
'WORKER_WELCOME' → 'o2w:worker:welcome'
'ASSIGN_TASK'    → 'o2w:task:assign'
'KILL_CLAUDE'    → 'o2w:claude:kill'
'PAUSE'          → 'o2w:execution:pause'
'RESUME'         → 'o2w:execution:resume'
'SHUTDOWN'       → 'o2w:worker:shutdown'
'ACK'            → 'o2w:ack'
'ERROR'          → 'o2w:error'
```

---

## Étapes

### 1. Modifier MessageType Enum

**Fichier** : `packages/shared-common/src/types.ts`

Chercher l'enum `MessageType` et remplacer toutes les valeurs :

```typescript
export enum MessageType {
	// W2O Messages
	WORKER_READY = 'w2o:worker:ready',
	WORKER_HEARTBEAT = 'w2o:worker:heartbeat',
	REQUEST_TASK = 'w2o:task:request',
	TASK_STARTED = 'w2o:task:started',
	TASK_PROGRESS = 'w2o:task:progress',
	TASK_COMPLETED = 'w2o:task:completed',
	TASK_FAILED = 'w2o:task:failed',
	TASK_QUESTION = 'w2o:task:question',
	FLOWS_UPDATED = 'w2o:flows:updated',
	FLOW_STEP_STARTED = 'w2o:flow:step:started',
	FLOW_STEP_COMPLETED = 'w2o:flow:step:completed',
	FLOW_STEP_FAILED = 'w2o:flow:step:failed',
	WORKSPACE_ALLOCATED = 'w2o:workspace:allocated',
	WORKSPACE_RELEASED = 'w2o:workspace:released',

	// O2W Messages
	WORKER_WELCOME = 'o2w:worker:welcome',
	ASSIGN_TASK = 'o2w:task:assign',
	KILL_CLAUDE = 'o2w:claude:kill',
	PAUSE = 'o2w:execution:pause',
	RESUME = 'o2w:execution:resume',
	SHUTDOWN = 'o2w:worker:shutdown',
	ACK = 'o2w:ack',
	ERROR = 'o2w:error',
}
```

**Note** : L'enum conserve les noms SCREAMING_SNAKE_CASE, mais les **valeurs** changent.

### 2. Worker (FlowWorker)

**Fichier** : `packages/worker/src/flow/FlowWorker.ts`

**Aucune modification nécessaire** si le code utilise déjà `MessageType.WORKER_READY`, etc.

Les valeurs de l'enum ont changé, donc les messages envoyés seront automatiquement mis à jour.

### 3. Orchestrator WebSocket Handlers

**Fichiers** :

- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts`
- `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts`
- `packages/orchestrator/src/websocket/WebSocketEventHandler.ts`

**Vérifier** : Le code utilise `MessageType.WORKER_READY`, pas `'WORKER_READY'`

Si string literals trouvés → Remplacer par enum :

```typescript
// AVANT
if (message.type === 'WORKER_READY') { ... }

// APRÈS
if (message.type === MessageType.WORKER_READY) { ... }
```

### 4. Tests

**Fichiers** :

- `packages/orchestrator/src/websocket/WebSocketConnectionManager.test.ts`
- `packages/orchestrator/src/websocket/WebSocketMessageRouter.test.ts`
- `packages/orchestrator/src/websocket/WebSocketEventHandler.test.ts`
- `packages/orchestrator/src/websocket/WorkerWebSocketServer.test.ts`

**Vérifier** : Tests utilisent l'enum, pas les strings

### 5. Créer Constantes (Optionnel)

Si besoin d'utilisation sans import de `MessageType` entier :

**Nouveau fichier** : `packages/shared-common/src/constants/MessageTypeConstants.ts`

```typescript
/** W2O Message Constants */
export const W2O_WORKER_READY = 'w2o:worker:ready' as const;
export const W2O_TASK_STARTED = 'w2o:task:started' as const;
// ... etc

/** O2W Message Constants */
export const O2W_TASK_ASSIGN = 'o2w:task:assign' as const;
export const O2W_WORKER_WELCOME = 'o2w:worker:welcome' as const;
// ... etc
```

### 6. Tests

```bash
npm run test -- packages/worker
npm run test -- packages/orchestrator/src/websocket
npm run check
```

---

## Fichiers Impactés

**Shared** : 1 fichier (types.ts)
**Worker** : 1 fichier (FlowWorker.ts) - vérification seulement
**Orchestrator** : 3 fichiers (websocket handlers)
**Tests** : 4 fichiers

**Total** : ~9 fichiers

---

## Estimation

**~1h** (Modification enum + vérifications + tests)

---

## Notes Importantes

1. **L'enum fait le gros du travail** : En changeant les valeurs dans `MessageType`, tous les usages sont mis à jour automatiquement
2. **Chercher les string literals** : `grep -r "'WORKER_READY'" packages/` pour trouver les usages directs
3. **WebSocket protocol** : Les messages réseau changent - worker et orchestrator doivent être redémarrés ensemble
