# Audit des événements WebSocket - Rapport et améliorations

## Vue d'ensemble

L'audit révèle **deux systèmes WebSocket distincts** avec des patterns différents mais globalement bien structurés. Il y a quelques inconsistances mineures mais aucun problème critique.

## Architecture actuelle

### 1. Worker WebSocket (Orchestrator ↔ Worker)

**Port:** 3738
**Fichiers clés:**

- `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts`
- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts`
- `packages/orchestrator/src/websocket/WebSocketEventHandler.ts`
- `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts`

**Pattern:**

- Messages typés avec préfixes `w2o:` (Worker→Orchestrator) et `o2w:` (Orchestrator→Worker)
- Factory functions type-safe: `createW2OMessage()`, `createO2WMessage()`
- Routing via switch-case dans `WebSocketMessageRouter`
- Sérialisation via `serializeMessage()` de `shared-common/protocol`

### 2. Frontend WebSocket (Backend ↔ Frontend)

**Endpoint:** `/api/transports/ws`
**Fichiers clés:**

- `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`
- `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`
- `packages/web-backend/src/transport/EventBroadcaster.ts`
- `packages/web-backend/src/transport/OrchestratorEventBridge.ts`

**Pattern:**

- Events typés avec préfixe `b2f:` (Backend→Frontend)
- Type system généré automatiquement pour CRUD: `ResourceEvent<'task', Task>`
- Broadcasting multi-transport via `EventBroadcaster`
- Subscription client-side avec filtres server-side
- Hook React réutilisable: `useRealtimeRefresh()`

## Points positifs ✅

1. **Type Safety:** Excellente utilisation de TypeScript avec des types générés automatiquement
2. **Factory Pattern:** `createW2OMessage()` et `createO2WMessage()` assurent la cohérence
3. **EventBroadcaster:** Abstraction propre pour le multi-transport
4. **OrchestratorEventBridge:** Bridge clair entre les deux systèmes
5. **useRealtimeRefresh:** Hook React réutilisable pour les subscriptions
6. **Naming Conventions:** Préfixes clairs (`w2o:`, `o2w:`, `b2f:`)

## Inconsistances identifiées ⚠️

### 1. Deux systèmes de sérialisation

- **Worker:** `serializeMessage()` custom
- **Frontend:** `JSON.stringify()` direct
- **Impact:** Gestion d'erreurs différente

### 2. UIWebSocketServer legacy

**Fichier:** `packages/orchestrator/src/websocket/UIWebSocketServer.ts`

Pattern EventEmitter legacy qui n'utilise pas les préfixes standards:

```typescript
this.uiClientHook.on('state_update', data => {
	this.broadcast(JSON.stringify({ type: 'state_update', ...data }));
});
```

Ce système semble redondant avec le nouveau système B2F.

### 3. Gestion de connexion fragmentée

- **Worker:** Simple Map dans `WebSocketConnectionManager`
- **Frontend:** Session management complexe avec cookies dans `TransportSessionManager`
- Pas de classe de base partagée

### 4. Routing patterns différents

- **Worker:** Switch-case dans `WebSocketMessageRouter`
- **Frontend:** EventEmitter pattern
- Stratégies de logging différentes

## Recommandations d'amélioration

### Priorité 1: Supprimer ou migrer UIWebSocketServer

**Problème:** Code legacy qui duplique les fonctionnalités du nouveau système B2F

**Action:**

1. Vérifier si `UIWebSocketServer` est encore utilisé
2. Migrer les événements vers le système B2F standard
3. Supprimer `UIWebSocketServer` si obsolète

**Fichiers impactés:**

- `packages/orchestrator/src/websocket/UIWebSocketServer.ts`
- `packages/orchestrator/src/hooks/UIClientHook.ts`

### Priorité 2: Unifier la sérialisation

**Problème:** Deux méthodes de sérialisation différentes

**Action:**

1. Créer `WebSocketSerializer` dans `shared-common`
2. Utiliser la même logique de sérialisation/validation partout
3. Centraliser la gestion d'erreurs

**Fichiers à créer:**

- `packages/shared-common/src/websocket/WebSocketSerializer.ts`

### Priorité 3: Extraire ConnectionManager base

**Problème:** Logique de gestion de connexion dupliquée

**Action:**

1. Créer classe abstraite `BaseConnectionManager<TClient>`
2. Implémenter `WorkerConnectionManager extends BaseConnectionManager<WorkerConnection>`
3. Implémenter `FrontendConnectionManager extends BaseConnectionManager<WebSocket>`

**Fichiers à créer:**

- `packages/shared-common/src/websocket/BaseConnectionManager.ts`

### Priorité 4: Documentation

**Problème:** L'architecture à deux couches n'est pas documentée

**Action:**

1. Créer `docs/websocket-architecture.md` expliquant:
    - Worker WebSocket vs Frontend WebSocket
    - Flux des événements: W2O → Orchestrator → O2B → Bridge → B2F
    - Quand utiliser quel système

2. Ajouter des diagrammes de séquence

## Verdict

**✅ Le système est globalement BIEN conçu:**

- Type safety excellente
- Séparation claire des responsabilités
- Patterns réutilisables (EventBroadcaster, useRealtimeRefresh)

**⚠️ Améliorations mineures recommandées:**

- Nettoyer le code legacy (UIWebSocketServer)
- Unifier la sérialisation
- Documenter l'architecture

**Aucun problème critique** nécessitant une refonte majeure.

## Plan d'implémentation (si améliorations acceptées)

### Phase 1: Audit UIWebSocketServer

1. Grep tous les usages de `UIWebSocketServer`
2. Vérifier si les événements sont migrés vers B2F
3. Créer un plan de migration si nécessaire

### Phase 2: Unification sérialisation

1. Créer `WebSocketSerializer` dans `shared-common`
2. Migrer Worker WebSocket
3. Migrer Frontend WebSocket
4. Tests de non-régression

### Phase 3: BaseConnectionManager

1. Extraire interface commune
2. Créer classe abstraite
3. Refactorer les implémentations existantes

### Phase 4: Documentation

1. Créer diagrammes d'architecture
2. Documenter les flows d'événements
3. Ajouter exemples d'usage

## Vérification

- Après chaque phase: lancer `npm run build` et `npm run test`
- Vérifier les WebSocket en dev: `npm run dev` et tester la connexion
- Check TypeScript: utiliser le skill `check`
