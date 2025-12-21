# Web UI Architecture Plan

## Overview

Documentation complète pour l'architecture de l'interface web de l'orchestrateur Agent Fleet.

**Pattern choisi**: Architecture inversée (Option B)

- L'orchestrateur se connecte à l'interface web (mode client)
- L'interface web agit comme serveur WebSocket
- Sécurité renforcée: l'orchestrateur contrôle quand/où se connecter

## Documents

### 1. [Architecture Overview](./web-ui-architecture-overview.md)

Vue d'ensemble de l'architecture, composants, patterns de communication.

**Contenu**:

- Principe de l'architecture inversée
- Composants (Orchestrator Core, Web UI)
- Support multi-UI
- Configuration
- Sécurité

### 2. [Scenario 1: Remote UI](./scenario-1-remote-ui.md)

Interface web hébergée sur cloud, orchestrateur sur desktop.

**Contenu**:

- Schéma d'architecture
- Flow de connexion
- Configuration cloud
- Sécurité (TLS, authentication)
- Deployment checklist

### 3. [Scenario 2: Local Dev](./scenario-2-local-dev.md)

Tout en local pour le développement.

**Contenu**:

- Schéma d'architecture
- Workflow de développement
- Scripts helper
- Hot reload support
- Troubleshooting

### 4. [Scenario 3: Embedded Mode](./scenario-3-embedded.md)

Orchestrateur lance l'UI comme process enfant.

**Contenu**:

- Schéma d'architecture
- Lifecycle management
- Implementation details
- Port selection strategy
- Packaging options

### 5. [Data Flow & Security](./data-flow-security.md)

Flux de données et considérations de sécurité.

**Contenu**:

- Message flows (state updates, commands)
- Layers de sécurité (auth, signing, whitelist)
- Configuration par scénario
- Audit logging
- Threat model

## Quick Reference

### Connection Pattern

```
Workers ──────► Orchestrator ──────► Web UI(s)
           (server mode)     (client mode)
```

### Message Types

**Orchestrator → UI** (push):

- `worker.connected`
- `worker.disconnected`
- `flow.progress`
- `flow.completed`
- `log`
- `metrics`

**UI → Orchestrator** (commands):

- `start_flow`
- `stop_flow`
- `retry_flow`
- `get_worker_status`
- `disconnect_worker`

### Security Layers

1. **Connection Auth**: Bearer token in WebSocket handshake
2. **Command Signing**: HMAC-SHA256 with timestamp
3. **Command Whitelist**: Explicit allowed commands
4. **Browser Auth**: OAuth/session separate from orchestrator

## Implementation Roadmap

### Phase 1: Core Infrastructure

- [ ] UIConnectionManager (WebSocket client)
- [ ] Message protocol definition
- [ ] Basic authentication
- [ ] State synchronization

### Phase 2: Web UI Application

- [ ] Backend server (Express + WebSocket)
- [ ] Frontend framework setup
- [ ] Dashboard components
- [ ] Real-time updates

### Phase 3: Security Hardening

- [ ] Command signing
- [ ] Rate limiting
- [ ] Audit logging
- [ ] Browser authentication

### Phase 4: Scenario Support

- [ ] Scenario 2: Local dev mode
- [ ] Scenario 1: Remote deployment
- [ ] Scenario 3: Embedded mode

### Phase 5: Advanced Features

- [ ] Multi-UI support
- [ ] Flow visualization
- [ ] Metrics dashboard
- [ ] Configuration management UI

## Next Steps

1. **Review & Validation**: Valider l'architecture avec l'équipe
2. **Tech Stack Selection**: Choisir framework frontend (React/Vue/Svelte)
3. **Protocol Definition**: Définir format exact des messages
4. **POC**: Implémenter scenario 2 (local dev) en premier
5. **Iterate**: Ajouter scenarios 1 et 3 progressivement

## Notes

- Tous les schémas sont en ASCII art pour faciliter la modification
- Les exemples de code sont en TypeScript
- La sécurité est prioritaire (flows exécutent du code)
- Support multi-UI dès le début pour scalabilité future
