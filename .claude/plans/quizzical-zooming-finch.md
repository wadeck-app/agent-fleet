# Plan: Analyse des utilisations du logger statique

## Contexte

Le projet utilise deux patterns de logging:

- **Ancien pattern**: Logger statique importé de `shared-common/logger`
- **Nouveau pattern**: Variable de module/instance créée avec `createLogger('Name')`

## Résultats de l'analyse

### ✅ Fichiers déjà migrés (45 fichiers)

- Utilisent `const log = createLogger('Name')` au niveau du module
- Majorité dans `packages/web-backend` (32 fichiers)
- Quelques fichiers dans `packages/orchestrator` (4 fichiers)
- Pattern d'instance dans `packages/worker` (2 fichiers)

### ❌ Fichiers à migrer (20 fichiers)

#### Packages/orchestrator (13 fichiers) - PRIORITÉ HAUTE

Fichiers core utilisant encore le logger statique:

1. `src/websocket/WorkerWebSocketServer.ts`
2. `src/websocket/WebSocketMessageRouter.ts`
3. `src/websocket/WebSocketEventHandler.ts`
4. `src/websocket/WebSocketConnectionManager.ts`
5. `src/websocket/UIWebSocketServer.ts`
6. `src/core/WorkerCoordinator.ts`
7. `src/core/TraceChunkStorage.ts`
8. `src/core/TaskManager.ts`
9. `src/core/RestAPI.ts`
10. `src/core/Orchestrator.ts`
11. `src/core/index.ts`
12. `src/metrics/MetricsCollector.ts`
13. `src/ui-client/UIClientHook.ts`

#### Packages/web-backend (7 fichiers) - PRIORITÉ MOYENNE

1. `src/server.ts` (point d'entrée principal)
2. `src/migrations/MigrateToBackendStorage.ts`
3. `src/scripts/migrate-projects.ts`
4. `src/transport/OrchestratorEventBridge.ts`
5. `src/utils/apiStats.ts`
6. `src/fastify/hooks/errorHandler.hook.ts`
7. `src/fastify/hooks/requestLogger.hook.ts`
8. `src/fastify/plugins/testRoutes.plugin.ts`

## Pattern de migration

```typescript
// ANCIEN:
import { logger } from 'shared-common/logger';
// NOUVEAU:
import { createLogger } from 'shared-common/logger';

logger.info('message');

const log = createLogger('ModuleName');
log.info('message');
```

## Plan de migration (20 fichiers)

### Étape 1: Migration packages/orchestrator (13 fichiers)

#### Groupe WebSocket (5 fichiers)

1. `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts`
2. `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts`
3. `packages/orchestrator/src/websocket/WebSocketEventHandler.ts`
4. `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts`
5. `packages/orchestrator/src/websocket/UIWebSocketServer.ts`

#### Groupe Core (5 fichiers)

6. `packages/orchestrator/src/core/WorkerCoordinator.ts`
7. `packages/orchestrator/src/core/TraceChunkStorage.ts`
8. `packages/orchestrator/src/core/TaskManager.ts`
9. `packages/orchestrator/src/core/RestAPI.ts`
10. `packages/orchestrator/src/core/Orchestrator.ts`

#### Autres (3 fichiers)

11. `packages/orchestrator/src/core/index.ts`
12. `packages/orchestrator/src/metrics/MetricsCollector.ts`
13. `packages/orchestrator/src/ui-client/UIClientHook.ts`

### Étape 2: Migration packages/web-backend (7 fichiers)

#### Priorité haute

1. `packages/web-backend/src/server.ts` (point d'entrée)

#### Transport & Utils

2. `packages/web-backend/src/transport/OrchestratorEventBridge.ts`
3. `packages/web-backend/src/utils/apiStats.ts`

#### Fastify hooks & plugins

4. `packages/web-backend/src/fastify/hooks/errorHandler.hook.ts`
5. `packages/web-backend/src/fastify/hooks/requestLogger.hook.ts`
6. `packages/web-backend/src/fastify/plugins/testRoutes.plugin.ts`

#### Scripts & migrations

7. `packages/web-backend/src/migrations/MigrateToBackendStorage.ts`
8. `packages/web-backend/src/scripts/migrate-projects.ts`

### Changements pour chaque fichier

Pour chaque fichier:

1. Remplacer `import { logger } from 'shared-common/logger'` par `import { createLogger } from 'shared-common/logger'`
2. Ajouter `const log = createLogger('NomDuModule')` en haut du fichier (après les imports)
3. Remplacer toutes les occurrences de `logger.` par `log.`
4. Utiliser un nom descriptif basé sur le fichier (ex: `createLogger('WorkerWebSocketServer')`)

## Vérification

### Pendant la migration

- Vérifier que chaque module utilise un nom unique et descriptif pour son logger
- S'assurer qu'aucun appel à l'ancien `logger` ne subsiste

### Après migration complète

1. Exécuter `/check` pour vérifier TypeScript/ESLint
2. Lancer les tests: `npm run test:agent`
3. Build le projet pour s'assurer qu'il n'y a pas d'erreurs
4. Vérifier que les logs conservent leur contexte avec les nouveaux noms de modules
