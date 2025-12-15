# Web UI Architecture - Overview

## Context

Interface web pour l'orchestrateur avec support de 3 scénarios de déploiement :
1. Remote UI (Desktop → Cloud)
2. Local Dev (Tout en local)
3. Embedded Mode (Orchestrator lance l'UI)

## Architecture Pattern: Option B - Inversée

**Principe**: L'orchestrateur se connecte à l'interface web (pas l'inverse)

**Avantages sécurité**:
- L'orchestrateur choisit quand/où se connecter
- Pas besoin d'exposer l'orchestrateur publiquement
- Critical car flows peuvent exécuter du code arbitraire
- Contrôle total côté orchestrateur

## Composants

### 1. Orchestrator Core (existant + modifications)

**Nouveau**: WebSocket Client Manager
- Maintient connexions sortantes vers UI(s)
- Envoie state updates (push)
- Reçoit commands et les valide
- Support multi-UI simultané

**Inchangé**: WebSocket Server pour workers
- `/ws/workers` endpoint
- Workers se connectent comme avant

### 2. Web UI Application (nouveau)

**Backend**:
- HTTP Server (static files)
- WebSocket Server (`/ws/orchestrator`)
- Authentication layer
- Command validation

**Frontend**:
- Dashboard temps réel
- Flow visualization
- Task management
- Logs streaming
- Metrics

## Communication Pattern

```
Workers → Orchestrator (mode server)
Orchestrator → Web UI(s) (mode client)
```

L'orchestrateur agit comme:
- **Server** pour workers
- **Client** pour UI(s)

## Multi-UI Support

L'orchestrateur peut se connecter simultanément à plusieurs UIs:
- Config: array d'endpoints
- Broadcast des events à tous les clients
- Chaque UI authentifiée indépendamment

## Configuration

```typescript
// Orchestrator config
{
  workers: {
    endpoint: "ws://localhost:8080/ws/workers"
  },
  uiClients: [
    {
      endpoint: "wss://my-hosted-ui.com/ws/orchestrator",
      authToken: "token-1",
      autoConnect: true
    },
    {
      endpoint: "ws://localhost:3000/ws/orchestrator",
      authToken: "token-2",
      autoConnect: false
    }
  ]
}
```

## Files Impacted

### New Files
- `src/orchestrator/ui-client/` - WebSocket client manager for UIs
- `src/orchestrator/ui-client/UIConnectionManager.ts`
- `src/orchestrator/ui-client/UIMessageHandler.ts`
- `src/orchestrator/ui-client/types.ts`

### Modified Files
- `src/orchestrator/core/index.ts` - Initialize UI client connections
- `src/orchestrator/core/OrchestratorCore.ts` - Integrate UI clients

## Security Considerations

- Token-based authentication
- Command signing (HMAC)
- Rate limiting
- Command whitelist
- Audit logging

## Related Documents

- [Scenario 1: Remote UI](./scenario-1-remote-ui.md)
- [Scenario 2: Local Dev](./scenario-2-local-dev.md)
- [Scenario 3: Embedded Mode](./scenario-3-embedded.md)
- [Data Flow & Security](./data-flow-security.md)
