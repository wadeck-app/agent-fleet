# OrchestratorClient Configuration Reference

## Table of Contents

- [Environment Variables](#environment-variables)
- [Mode Configuration](#mode-configuration)
- [Transport Configuration](#transport-configuration)
- [Build Configuration](#build-configuration)
- [npm Scripts Reference](#npm-scripts-reference)
- [Docker Configuration](#docker-configuration)
- [Performance Tuning](#performance-tuning)

---

## Environment Variables

All environment variables are configured in `packages/web-backend/.env`.

### Core Configuration

```bash
# ===========================================================================================
# Orchestrator Configuration
# ===========================================================================================

# Orchestrator Mode: 'library' or 'remote'
# - library: Embedded orchestrator (same process, uses dynamic import)
# - remote: Connect to external orchestrator-server via HTTP/WebSocket
ORCHESTRATOR_MODE=library

# Remote Mode Configuration (only used when ORCHESTRATOR_MODE=remote)
# URL of the orchestrator-server (HTTP/WebSocket endpoint)
ORCHESTRATOR_URL=http://localhost:3737

# Transport protocol for remote mode: 'auto', 'websocket', 'rest-sse', 'rest-longpolling'
# - auto: Try WebSocket → REST+SSE → REST+LongPolling (recommended)
# - websocket: Bidirectional WebSocket (best performance)
# - rest-sse: REST requests + Server-Sent Events (good fallback)
# - rest-longpolling: REST + Long-polling (maximum compatibility)
ORCHESTRATOR_TRANSPORT=auto

# Library Mode Configuration (only used when ORCHESTRATOR_MODE=library)
# Ports for embedded orchestrator
ORCHESTRATOR_WS_PORT=3738
ORCHESTRATOR_REST_PORT=3737
```

**Location in codebase**: `packages/web-backend/.env.example:27-53`

---

## Mode Configuration

### Library Mode Setup

**Environment**:

```bash
ORCHESTRATOR_MODE=library
ORCHESTRATOR_WS_PORT=3738
ORCHESTRATOR_REST_PORT=3737
```

**Code** (`packages/web-backend/src/server.ts:44-72`):

```typescript
if (mode === 'library') {
  // Dynamic import to avoid bundling orchestrator in remote mode builds
  // @ts-expect-error - orchestrator is a devDependency, only available at runtime in library mode
  const { Orchestrator } = await import('orchestrator/core/index.js');

  // Create orchestrator instance
  const orchestratorWsPort = parseInt(process.env.ORCHESTRATOR_WS_PORT || '3738', 10);
  const orchestratorRestPort = parseInt(process.env.ORCHESTRATOR_REST_PORT || '3737', 10);

  const orchestrator = new Orchestrator({
    wsPort: orchestratorWsPort,
    restPort: orchestratorRestPort,
  });

  await orchestrator.start();

  // Create LibraryAdapter
  const orchestratorClient = await OrchestratorClientFactory.create(
    { mode: 'library' },
    orchestrator
  );

  await orchestratorClient.connect();

  return orchestratorClient;
}
```

**When to use**:

- Development (hot reload, single process debugging)
- Small deployments (single server)
- Testing (faster startup)

**Advantages**:

- Zero network latency (<1ms)
- Simpler deployment (single process/container)
- Lower resource usage

**Disadvantages**:

- No horizontal scaling
- Shared fate (backend crash = orchestrator crash)

---

### Remote Mode Setup

**Environment**:

```bash
ORCHESTRATOR_MODE=remote
ORCHESTRATOR_URL=http://localhost:3737
ORCHESTRATOR_TRANSPORT=auto
```

**Code** (`packages/web-backend/src/server.ts:73-93`):

```typescript
if (mode === 'remote') {
  const url = process.env.ORCHESTRATOR_URL;
  if (!url) {
    throw new Error('ORCHESTRATOR_URL is required when ORCHESTRATOR_MODE=remote');
  }

  const transportMode = (process.env.ORCHESTRATOR_TRANSPORT as any) || 'auto';

  const orchestratorClient = await OrchestratorClientFactory.create({
    mode: 'remote',
    url,
    transportMode,
  });

  await orchestratorClient.connect();

  return orchestratorClient;
}
```

**When to use**:

- Production deployments
- Horizontal scaling (multiple backend instances)
- High availability requirements
- Microservices architecture

**Advantages**:

- Horizontal scalability (multiple backends → single orchestrator)
- Independent deployment/scaling
- Fault isolation (backend crash ≠ orchestrator crash)

**Disadvantages**:

- Network latency (1-10ms)
- Higher operational complexity
- More resources (separate processes)

---

## Transport Configuration

### Transport Modes (Remote Mode Only)

#### auto (Recommended)

Automatically tries transports in order of preference:

**Fallback Chain**:

1. **WebSocket** (best: bidirectional, low latency)
2. **REST + SSE** (good: unidirectional events, HTTP-based)
3. **REST + Long-polling** (ok: maximum compatibility, higher latency)

```bash
ORCHESTRATOR_TRANSPORT=auto
```

**Use when**: You want maximum reliability with automatic fallback.

**Implementation**: `packages/orchestrator-adapters/src/transport/TransportFactory.ts:25-69`

---

#### websocket

Force WebSocket transport (bidirectional, persistent connection).

```bash
ORCHESTRATOR_TRANSPORT=websocket
```

**Characteristics**:

- **Latency**: 1-5ms
- **Bidirectional**: Yes
- **Reconnection**: Automatic with exponential backoff
- **Compatibility**: Requires WebSocket support (may be blocked by firewalls)

**Use when**:

- Low latency required
- You control the network (no firewall restrictions)
- WebSocket is confirmed to work in your environment

**Endpoint**: `GET /orchestrator/ws`

---

#### rest-sse

Force REST + Server-Sent Events transport.

```bash
ORCHESTRATOR_TRANSPORT=rest-sse
```

**Characteristics**:

- **Latency**: 2-8ms
- **Bidirectional**: Requests (HTTP POST), Events (SSE)
- **Reconnection**: SSE auto-reconnects
- **Compatibility**: HTTP-based (works through most firewalls)

**Use when**:

- WebSocket blocked by firewall
- You need HTTP-based solution
- SSE is supported by your infrastructure

**Endpoints**:

- Requests: `POST /orchestrator/request`
- Events: `GET /orchestrator/events` (SSE stream)

---

#### rest-longpolling

Force REST + Long-polling transport (maximum compatibility).

```bash
ORCHESTRATOR_TRANSPORT=rest-longpolling
```

**Characteristics**:

- **Latency**: 5-15ms
- **Bidirectional**: Requests (HTTP POST), Events (HTTP GET with long timeout)
- **Reconnection**: Manual (client polls again)
- **Compatibility**: Maximum (works everywhere HTTP works)

**Use when**:

- WebSocket and SSE are both blocked
- You need maximum compatibility
- Higher latency is acceptable

**Endpoints**:

- Requests: `POST /orchestrator/request`
- Events: `GET /orchestrator/poll?timeout=30000`

---

## Build Configuration

### orchestrator-adapters Build Modes

#### Library Mode Build

**Command**:

```bash
cd packages/orchestrator-adapters
npm run build:library
```

**Build Script** (`packages/orchestrator-adapters/build.library.mjs`):

```javascript
await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	outdir: 'dist',
	format: 'esm',
	platform: 'node',
	target: 'node18',
	// Keep these external (provided by consuming package)
	external: ['shared-common', 'shared-orch-backend', 'ws'],
	// orchestrator is NOT external - bundle it for library mode
	define: {
		'process.env.ORCHESTRATOR_MODE': '"library"',
	},
	sourcemap: true,
});
```

**Result**: orchestrator package **bundled** into dist (~500KB larger).

---

#### Remote Mode Build

**Command**:

```bash
cd packages/orchestrator-adapters
npm run build:remote
```

**Build Script** (`packages/orchestrator-adapters/build.remote.mjs`):

```javascript
await esbuild.build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	outdir: 'dist',
	format: 'esm',
	platform: 'node',
	target: 'node18',
	// Keep these external (provided by consuming package or peer dependency)
	external: ['orchestrator', 'shared-common', 'shared-orch-backend', 'ws'],
	define: {
		'process.env.ORCHESTRATOR_MODE': '"remote"',
	},
	sourcemap: true,
});
```

**Result**: orchestrator package **externalized** (~500KB smaller).

---

## npm Scripts Reference

### Development Scripts

```bash
# Library mode development (single process, hot reload)
npm run dev:library

# Remote mode development (requires orchestrator-server running)
npm run dev:remote

# Start orchestrator-server (for remote mode)
cd packages/orchestrator-server
npm run dev
```

**Full Script Definitions** (`packages/web-backend/package.json:14-15`):

```json
{
	"dev:library": "cross-env ORCHESTRATOR_MODE=library nodemon --watch src --watch ../shared-frontend-backend/src --watch ../shared-orch-backend/src --watch ../shared-common/src --exec tsx src/server.ts",
	"dev:remote": "cross-env ORCHESTRATOR_MODE=remote ORCHESTRATOR_URL=http://localhost:3737 nodemon --watch src --watch ../shared-frontend-backend/src --watch ../shared-orch-backend/src --watch ../shared-common/src --exec tsx src/server.ts"
}
```

---

### Production Scripts

```bash
# Build and start in library mode
npm run build
npm run start:library

# Build and start in remote mode (requires orchestrator-server)
npm run build
npm run start:remote
```

**Full Script Definitions** (`packages/web-backend/package.json:19-20`):

```json
{
	"start:library": "cross-env ORCHESTRATOR_MODE=library node dist/server.js",
	"start:remote": "cross-env ORCHESTRATOR_MODE=remote node dist/server.js"
}
```

---

## Docker Configuration

### Library Mode Docker

**Dockerfile**: `docker/Dockerfile.backend-library`

**Build**:

```bash
docker build -f docker/Dockerfile.backend-library -t backend-library .
```

**Run**:

```bash
docker run -p 3000:3000 \
  -e ORCHESTRATOR_MODE=library \
  backend-library
```

**Image includes**: Backend + Orchestrator (~200MB)

---

### Remote Mode Docker

**Dockerfile**: `docker/Dockerfile.backend-remote`

**Build**:

```bash
docker build -f docker/Dockerfile.backend-remote -t backend-remote .
```

**Run with docker-compose**:

```bash
docker-compose -f docker/docker-compose.remote.yml up
```

**Services**:

- `orchestrator-server` (port 3737)
- `backend` (port 3000, connects to orchestrator-server)

**Image includes**: Backend only (~150MB, no orchestrator)

---

### docker-compose Configuration

**File**: `docker/docker-compose.remote.yml`

```yaml
version: '3.8'

services:
    orchestrator-server:
        build:
            context: ..
            dockerfile: docker/Dockerfile.orchestrator-server
        ports:
            - '3737:3737'
        environment:
            - NODE_ENV=production
            - ORCHESTRATOR_SERVER_PORT=3737
            - ORCHESTRATOR_WS_PORT=3738
        healthcheck:
            test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:3737/health']
            interval: 10s

    backend:
        build:
            context: ..
            dockerfile: docker/Dockerfile.backend-remote
        ports:
            - '3000:3000'
        environment:
            - NODE_ENV=production
            - ORCHESTRATOR_MODE=remote
            - ORCHESTRATOR_URL=http://orchestrator-server:3737
            - ORCHESTRATOR_TRANSPORT=auto
        depends_on:
            orchestrator-server:
                condition: service_healthy
```

---

## Performance Tuning

### Library Mode Optimization

```bash
# Increase Node.js memory limit (if needed)
NODE_OPTIONS='--max-old-space-size=4096' npm run start:library

# Enable V8 optimization flags
NODE_OPTIONS='--optimize-for-size --gc-interval=100' npm run start:library
```

---

### Remote Mode Optimization

#### WebSocket Transport Tuning

```typescript
// In orchestrator-adapters (future configuration support)
{
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'websocket',
  transportConfig: {
    reconnectInterval: 1000,     // Initial reconnect delay (ms)
    reconnectBackoff: 1.5,        // Backoff multiplier
    maxReconnectInterval: 30000,  // Max reconnect delay (ms)
    pingInterval: 30000,          // Heartbeat interval (ms)
    requestTimeout: 5000,         // Request timeout (ms)
  }
}
```

#### Connection Pooling (Future Enhancement)

```typescript
// Pool multiple connections for higher throughput
{
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'websocket',
  poolSize: 5,  // Multiple WebSocket connections
}
```

---

### Transport Mode Performance Comparison

| Mode                 | Latency | Throughput | CPU Usage | Memory   | Best For                 |
| -------------------- | ------- | ---------- | --------- | -------- | ------------------------ |
| **library**          | <1ms    | Very High  | Medium    | Medium   | Development, small scale |
| **websocket**        | 1-5ms   | High       | Low       | Low      | Production (best)        |
| **rest-sse**         | 2-8ms   | Medium     | Medium    | Medium   | Firewall restrictions    |
| **rest-longpolling** | 5-15ms  | Low        | High      | High     | Maximum compatibility    |
| **auto**             | 1-15ms  | Variable   | Variable  | Variable | Unknown environment      |

---

## Next Steps

- See [Usage Guide](./orchestrator-client-usage.md) for implementation examples
- See [Architecture Overview](./backend-orchestrator-transport.md) for design details
- See [Migration Guide](./migration-guide-orchestrator-client.md) for transition steps
