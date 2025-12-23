# Relay Architecture - Future Network Topologies

## Table of Contents

- [Introduction](#introduction)
- [When to Use Relays](#when-to-use-relays)
- [Frontend-Backend Relay](#frontend-backend-relay)
- [Orchestrator-Worker Relay](#orchestrator-worker-relay)
- [Implementation Guidelines](#implementation-guidelines)
- [Comparison with Remote Mode](#comparison-with-remote-mode)

---

## Introduction

The agent-fleet architecture uses **embedded orchestrator** (library mode) by default, where the backend and orchestrator run in the same process. This provides zero-latency communication and simplified deployment.

For advanced network topologies, **dedicated relay components** can be implemented instead of a full remote mode. Relays are simpler, more targeted solutions for specific networking scenarios.

---

## When to Use Relays

### You DON'T need a relay if:

- ✅ Frontend, Backend, and Workers are on the same network
- ✅ Backend is directly accessible from frontend
- ✅ Workers can directly connect to backend

**Use the default embedded architecture.**

### You MIGHT need a relay if:

- 🔶 Frontend is on internet, Backend+Orchestrator is on local network
- 🔶 Workers are on different networks (cloud, home, corporate)
- 🔶 Need to expose minimal surface to internet
- 🔶 Complex firewall/NAT traversal requirements

**Consider implementing a dedicated relay.**

---

## Frontend-Backend Relay

### Use Case

Expose backend to internet while keeping it on local network.

```
Phone/Browser (Internet)
      ↓
Frontend-Relay (Public Server)
      ↓
Backend+Orchestrator (Local Network)
      ↓
Workers (Local Network)
```

### Architecture

```
┌─────────────────────┐
│  Frontend           │
│  (Browser/Mobile)   │
└──────────┬──────────┘
           │ HTTPS/WSS
           ↓
┌──────────────────────┐
│  Frontend-Relay      │
│  (Public Cloud)      │
│                      │
│  • HTTP Proxy        │
│  • WebSocket Proxy   │
│  • SSL Termination   │
│  • Rate Limiting     │
│  • Authentication    │
└──────────┬───────────┘
           │ HTTP/WS (tunnel or VPN)
           ↓
┌──────────────────────────────────┐
│  Backend+Orchestrator            │
│  (Local Network)                 │
│                                  │
│  ┌─────────┐   ┌──────────────┐ │
│  │Backend  │───│ Orchestrator │ │
│  └─────────┘   └──────┬───────┘ │
└─────────────────────┼────────────┘
                      │
                      ↓
               ┌────────────┐
               │  Workers   │
               └────────────┘
```

### Implementation

**Simple HTTP/WebSocket proxy:**

```typescript
// packages/frontend-relay/src/server.ts
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({
	target: 'http://backend.local:3000', // Local backend URL
	ws: true, // Enable WebSocket proxying
});

// HTTP requests
app.use((req, res) => {
	proxy.web(req, res);
});

// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
	proxy.ws(req, socket, head);
});
```

**Key Features:**

- Simple forwarding (no business logic)
- SSL termination at relay
- Optional authentication/rate limiting
- Tunnel or VPN connection to local network

**Estimated Development Time:** 1-2 days

---

## Orchestrator-Worker Relay

### Use Case

Workers on different networks need to connect to orchestrator.

```
Backend+Orchestrator (Network A)
      ↓
Worker-Relay (Accessible from both networks)
      ↓
Workers (Network B: Cloud, Home, Corporate)
```

### Architecture

```
┌────────────────────────────────┐
│  Backend+Orchestrator          │
│  (Network A)                   │
│                                │
│  ┌─────────┐   ┌────────────┐ │
│  │Backend  │───│Orchestrator│ │
│  └─────────┘   └─────┬──────┘ │
└─────────────────────┼──────────┘
                      │ WebSocket
                      ↓
           ┌──────────────────────┐
           │  Worker-Relay        │
           │  (Bridge Server)     │
           │                      │
           │  • WebSocket Bridge  │
           │  • Message Forwarding│
           │  • Connection Pool   │
           └──────────┬───────────┘
                      │ WebSocket
                      ↓
              ┌────────────────────┐
              │  Workers           │
              │  (Network B)       │
              │                    │
              │  W1, W2, W3...     │
              └────────────────────┘
```

### Implementation

**WebSocket message forwarder:**

```typescript
// packages/worker-relay/src/server.ts
import WebSocket from 'ws';

// Connect to orchestrator
const orchestratorWs = new WebSocket('ws://orchestrator.local:3738');

// Accept worker connections
const wss = new WebSocket.Server({ port: 4738 });

// Forward messages bidirectionally
wss.on('connection', workerWs => {
	// Orchestrator → Worker
	orchestratorWs.on('message', data => {
		workerWs.send(data);
	});

	// Worker → Orchestrator
	workerWs.on('message', data => {
		orchestratorWs.send(data);
	});
});
```

**Key Features:**

- Simple message forwarding
- No protocol modification
- Stateless (can restart without affecting workers)
- Connection pooling for multiple workers

**Estimated Development Time:** 1-2 days

---

## Implementation Guidelines

### Design Principles

1. **Keep it Simple**
    - Pure forwarding, no business logic
    - No state management (stateless preferred)
    - Minimal dependencies

2. **Security**
    - SSL/TLS for external connections
    - Optional authentication at relay
    - Rate limiting to prevent abuse

3. **Monitoring**
    - Connection counts
    - Message throughput
    - Error rates

4. **Configuration**
    - Upstream URL (backend or orchestrator)
    - Listen port
    - SSL certificates
    - Authentication tokens (optional)

### Technology Choices

**Frontend-Relay:**

- `http-proxy` - Simple HTTP/WebSocket proxy
- `express` - For additional middleware (auth, rate limiting)
- `nginx` - Alternative if pure configuration is preferred

**Worker-Relay:**

- `ws` - WebSocket library
- Pure Node.js (minimal dependencies)
- Docker container for easy deployment

### Deployment

Both relays should be:

- Lightweight containers (< 50MB)
- Stateless (can restart anytime)
- Simple configuration (environment variables)
- Minimal resource usage (< 100MB RAM)

---

## Comparison with Remote Mode

### Why Relays Instead of Remote Mode?

| Aspect          | Remote Mode (Removed)     | Dedicated Relays                   |
| --------------- | ------------------------- | ---------------------------------- |
| **Complexity**  | 2500+ lines of code       | ~200 lines each                    |
| **Purpose**     | Generic B↔O communication | Specific network bridging          |
| **Maintenance** | High (multiple protocols) | Low (simple forwarding)            |
| **Performance** | Network overhead B↔O      | Network overhead only where needed |
| **Flexibility** | One-size-fits-all         | Targeted solutions                 |
| **Development** | Complex (3 transports)    | Simple (1-2 days each)             |

### Benefits of Relay Approach

✅ **Simpler**: Each relay has one clear purpose
✅ **Targeted**: Only implement what you need
✅ **Maintainable**: Small, focused codebases
✅ **Performant**: B↔O stays in-process (0ms latency)
✅ **Flexible**: Can combine multiple relays if needed

---

## Future Work

If relay patterns emerge, consider:

1. **Relay Template Package**
    - Reusable relay scaffolding
    - Common middleware (auth, logging, metrics)
    - Docker templates

2. **Relay Discovery**
    - Service discovery for relay networks
    - Automatic failover between relays

3. **Relay Monitoring**
    - Centralized metrics dashboard
    - Health checks and alerts

---

## References

- Embedded Architecture: `.claude/docs/backend-orchestrator-transport.md`
- WebSocket Proxying: [http-proxy documentation](https://github.com/http-party/node-http-proxy)
- Network Topologies: Plan file `.claude/plans/2025-12-23-backend-orch-fusion.md`
