# Scenario 2: Local Dev (Tout en local)

## Use Case

- Développement de l'interface web en local
- Orchestrator tourne en local également
- Pas besoin de déploiement cloud
- Fast iteration loop pour développeurs UI

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Localhost (Dev Machine)                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Web UI Application (Port 3000)                 │ │
│  │  ┌──────────────────┐      ┌─────────────────────┐   │ │
│  │  │  HTTP Server     │      │  WebSocket Server   │   │ │
│  │  │  (Dev Server)    │      │  (/ws/orchestrator) │   │ │
│  │  └──────────────────┘      └─────────────────────┘   │ │
│  │           │                          ▲                 │ │
│  └───────────┼──────────────────────────┼─────────────────┘ │
│              │                          │                   │
│              │ http://localhost:3000    │ ws://localhost:3000
│              │                          │                   │
│              ▼                          │                   │
│         ┌──────────┐                    │                   │
│         │ Browser  │                    │                   │
│         └──────────┘                    │                   │
│                                         │                   │
│  ┌──────────────────────────────────────┼─────────────────┐ │
│  │         Orchestrator Core            │                 │ │
│  │  ┌───────────────────────────────────┴───────────────┐ │ │
│  │  │  WebSocket Client Manager                         │ │ │
│  │  │  - Connected to ws://localhost:3000               │ │ │
│  │  └───────────────────────────────────┬───────────────┘ │ │
│  │                                      │                 │ │
│  │  ┌───────────────────────────────────┴───────────────┐ │ │
│  │  │  WebSocket Server (/ws/workers)                   │ │ │
│  │  └───────────────────────────────────┬───────────────┘ │ │
│  └──────────────────────────────────────┼─────────────────┘ │
│                                         ▲                   │
│                                         │                   │
│                                ┌────────┴─────────┐         │
│                                │                  │         │
│                           ┌────┴────┐       ┌────┴────┐    │
│                           │ Worker  │       │ Worker  │    │
│                           │   #1    │       │   #2    │    │
│                           └─────────┘       └─────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Development Workflow

### 1. Start Web UI (Terminal 1)

```bash
cd web-ui/
npm run dev
# → Starts on http://localhost:3000
# → WebSocket server ready on ws://localhost:3000/ws/orchestrator
```

### 2. Start Orchestrator (Terminal 2)

```bash
cd agent-fleet/
npm run dev:orchestrator
# → Connects to ws://localhost:3000/ws/orchestrator
# → Starts worker server on ws://localhost:8080/ws/workers
```

### 3. Start Workers (Terminal 3+)

```bash
npm run dev:worker
# → Connects to ws://localhost:8080/ws/workers
```

### 4. Open Browser

```
http://localhost:3000
```

## Connection Flow

1. **Web UI démarrage**:
   - Dev server (Vite/Webpack) sur port 3000
   - WebSocket server embedded
   - Hot reload activé

2. **Orchestrator démarrage**:
   - Lit config locale: `ws://localhost:3000/ws/orchestrator`
   - Tente connexion
   - Si UI pas encore up: retry avec backoff

3. **Runtime**:
   - Changes dans UI → hot reload → reconnexion orchestrator
   - Changes dans orchestrator → restart → reconnexion automatique
   - État persisté pour éviter perte de contexte

## Configuration Example

```typescript
// Orchestrator config (dev mode)
{
  mode: "development",
  uiClients: [
    {
      endpoint: "ws://localhost:3000/ws/orchestrator",
      authToken: "dev-token-insecure",
      autoConnect: true,
      reconnect: {
        enabled: true,
        maxAttempts: -1, // infinite in dev
        backoff: "constant",
        delay: 2000
      }
    }
  ]
}

// Web UI config (dev mode)
{
  mode: "development",
  orchestrator: {
    expectedToken: "dev-token-insecure",
    allowedOrigins: ["http://localhost:3000"],
  },
  hotReload: true,
  cors: {
    enabled: true,
    origins: "*"
  }
}
```

## Dev Features

### Auto-reconnect
- Orchestrator détecte UI restart (hot reload)
- Reconnexion automatique sans intervention
- Queue des messages pendant reconnexion

### Mock Data
- UI peut fonctionner sans orchestrator (mode standalone)
- Mock orchestrator pour tests frontend purs
- Seed data pour développement UI

### Debug Tools
- WebSocket message inspector
- State snapshot/restore
- Time-travel debugging
- Performance profiling

## File Structure

```
project/
├── agent-fleet/              # Orchestrator
│   ├── src/
│   ├── config/
│   │   └── dev.config.ts     # Dev config avec localhost
│   └── package.json
│
├── web-ui/                   # Interface web
│   ├── src/
│   ├── config/
│   │   └── dev.config.ts     # Dev config
│   └── package.json
│
└── scripts/
    ├── dev-all.sh            # Start tout en parallèle
    └── dev-orchestrator.sh   # Start orchestrator seul
```

## Helper Scripts

### dev-all.sh
```bash
#!/bin/bash
# Start everything in parallel

trap 'kill 0' EXIT  # Kill all on exit

echo "Starting Web UI..."
cd web-ui && npm run dev &

echo "Waiting for UI to be ready..."
sleep 5

echo "Starting Orchestrator..."
cd agent-fleet && npm run dev:orchestrator &

echo "Starting Worker..."
cd agent-fleet && npm run dev:worker &

wait
```

### package.json scripts
```json
{
  "scripts": {
    "dev": "node scripts/dev-all.sh",
    "dev:ui": "cd web-ui && npm run dev",
    "dev:orchestrator": "tsx src/orchestrator/core/index.ts --config config/dev.config.ts",
    "dev:worker": "tsx src/workers/flow/FlowWorker.ts"
  }
}
```

## Troubleshooting

### Port already in use
```bash
# Find process
lsof -i :3000
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>
taskkill /PID <PID> /F  # Windows
```

### Connection refused
- Vérifier UI est started
- Vérifier firewall local
- Vérifier config endpoint

### Hot reload casse connexion
- Normal, reconnexion auto activée
- Vérifier logs orchestrator pour reconnexion
- Augmenter reconnect delay si trop rapide

## Pros/Cons

**Pros**:
- Fast iteration (hot reload)
- Pas de dépendance réseau externe
- Debug facile (tous les logs locaux)
- Pas de coût cloud
- Offline development

**Cons**:
- Config différente de prod (localhost vs cloud)
- Pas de test de latence réseau
- Pas de test de auth réelle
- Setup initial plus complexe (2+ processes)
