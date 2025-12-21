# Scenario 1: Remote UI (Desktop → Cloud)

## Use Case

- Interface web hébergée sur un serveur cloud (AWS, Vercel, etc.)
- Orchestrateur sur desktop s'y connecte
- Laptop/mobile peut accéder via browser à l'interface distante
- Monitoring/management à distance

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud/Hosted Server                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Web UI Application                        │ │
│  │  ┌──────────────────┐      ┌─────────────────────┐   │ │
│  │  │  HTTP Server     │      │  WebSocket Server   │   │ │
│  │  │  (Static Files)  │      │  (/ws/orchestrator) │   │ │
│  │  └──────────────────┘      └─────────────────────┘   │ │
│  │           │                          ▲                 │ │
│  └───────────┼──────────────────────────┼─────────────────┘ │
│              │                          │                   │
└──────────────┼──────────────────────────┼───────────────────┘
               │                          │
               │ HTTPS                    │ WSS (client mode)
               │                          │
               ▼                          │
         ┌──────────┐                     │
         │ Laptop   │                     │
         │ Browser  │                     │
         └──────────┘                     │
                                          │
                                          │
    ┌─────────────────────────────────────┼──────────┐
    │         Desktop Machine             │          │
    │  ┌──────────────────────────────────┴────────┐ │
    │  │         Orchestrator Core                 │ │
    │  │  ┌─────────────────────────────────────┐  │ │
    │  │  │  WebSocket Client Manager           │  │ │
    │  │  │  - Connects to UI(s)                │  │ │
    │  │  │  - Sends state updates              │  │ │
    │  │  │  - Receives commands                │  │ │
    │  │  └─────────────────────────────────────┘  │ │
    │  │                    │                       │ │
    │  │  ┌─────────────────┴─────────────────┐    │ │
    │  │  │  WebSocket Server                 │    │ │
    │  │  │  (/ws/workers)                    │    │ │
    │  │  └─────────────────┬─────────────────┘    │ │
    │  └────────────────────┼────────────────────────┘ │
    └───────────────────────┼──────────────────────────┘
                            ▲
                            │ WS (server mode)
                            │
                   ┌────────┴─────────┐
                   │                  │
              ┌────┴────┐       ┌────┴────┐
              │ Worker  │       │ Worker  │
              │   #1    │       │   #2    │
              └─────────┘       └─────────┘
```

## Connection Flow

1. **Web UI démarrage**:
    - Déployée sur cloud (ex: `https://my-ui.vercel.app`)
    - WebSocket server écoute sur `/ws/orchestrator`
    - Attend connexions authentifiées

2. **Orchestrator démarrage**:
    - Lit config: `uiEndpoint: "wss://my-ui.vercel.app/ws/orchestrator"`
    - Initie connexion WebSocket sortante
    - Envoie auth token dans handshake

3. **Authentification**:
    - UI valide token
    - Si valid: connexion établie
    - Si invalid: reject + log attempt

4. **Runtime**:
    - Orchestrator push state updates → UI
    - UI broadcast updates → tous browsers connectés
    - Browser envoie command → UI → Orchestrator
    - Orchestrator valide + exécute + retourne résultat

## Security Considerations

### Réseau

- **TLS obligatoire** (WSS) pour connexions cloud
- Certificats valides (Let's Encrypt)
- Firewall: Orchestrator n'expose rien publiquement

### Authentication

- Token partagé orchestrator ↔ UI (rotating tokens recommandé)
- Browser → UI: session-based auth (JWT, OAuth)
- Séparation des credentials

### Commands

- Signature HMAC pour chaque command
- Whitelist de commands autorisées
- Rate limiting côté UI
- Audit log complet

### Network Failures

- Auto-reconnect orchestrator avec backoff
- Queue commands pendant déconnexion
- Status visible dans UI

## Configuration Example

```typescript
// Orchestrator config
{
  uiClients: [
    {
      endpoint: "wss://my-ui.vercel.app/ws/orchestrator",
      authToken: process.env.UI_AUTH_TOKEN,
      autoConnect: true,
      reconnect: {
        enabled: true,
        maxAttempts: 10,
        backoff: "exponential"
      }
    }
  ]
}

// Web UI config
{
  orchestrator: {
    expectedToken: process.env.ORCHESTRATOR_TOKEN,
    allowedOrigins: ["*"], // ou liste spécifique
  },
  browser: {
    authProvider: "oauth", // Google, GitHub, etc.
    allowedUsers: ["user@example.com"]
  }
}
```

## Deployment Checklist

- [ ] Deploy Web UI to cloud (Vercel/AWS/Heroku)
- [ ] Configure SSL/TLS certificates
- [ ] Set environment variables (tokens)
- [ ] Test WebSocket connectivity from desktop
- [ ] Configure browser auth (OAuth provider)
- [ ] Setup monitoring/alerting
- [ ] Document connection troubleshooting

## Pros/Cons

**Pros**:

- Accès depuis n'importe où (laptop, mobile)
- Pas besoin d'exposer orchestrator
- Scalable (load balancer devant UI si besoin)
- Logs centralisés

**Cons**:

- Dépend de connexion internet
- Latence réseau pour commands
- Coût d'hébergement UI
- Gestion des tokens/secrets
