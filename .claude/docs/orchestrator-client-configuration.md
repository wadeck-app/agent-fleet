# OrchestratorClient Configuration Reference

## Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Port Calculation](#port-calculation)
- [npm Scripts Reference](#npm-scripts-reference)

---

## Environment Variables

All environment variables are configured in `packages/web-backend/.env`.

### Orchestrator Configuration

```bash
# ===========================================================================================
# Orchestrator Configuration
# ===========================================================================================
# The orchestrator runs embedded in the backend process (library mode).
# This provides zero-latency communication and simplified deployment.

# Ports for embedded orchestrator
# - WS_PORT: WebSocket port for worker connections (default: 3738)
# - REST_PORT: REST API port for orchestrator management (default: 3737)
ORCHESTRATOR_WS_PORT=3738
ORCHESTRATOR_REST_PORT=3737
```

**Location in codebase**: `packages/web-backend/.env.example:27-37`

---

## Configuration Examples

### Basic Configuration (Library Mode)

```typescript
// packages/web-backend/src/server.ts
import { OrchestratorClientFactory } from 'orchestrator-adapters';

const orchestratorClient = await OrchestratorClientFactory.create({
	mode: 'library',
	wsPort: 3738, // WebSocket port for workers
	restPort: 3737, // REST API port (optional)
});

await orchestratorClient.connect();
```

### Test Mode Configuration

```typescript
// In test files
import { OrchestratorClientFactory, createMockOrchestrator } from 'orchestrator-adapters';

const orchestratorClient = await OrchestratorClientFactory.create({
	mode: 'test',
	mockOrchestrator: createMockOrchestrator(), // Optional custom mock
});

await orchestratorClient.connect();
```

---

## Port Calculation

Ports are calculated automatically to support parallel development:

```typescript
// From PROJECT_ID and WORKSPACE_ID environment variables
// Default calculation in packages/shared-common/src/PortCalculator.ts

PROJECT_ID=0, WORKSPACE_ID=0 → WS:3738, REST:3737
PROJECT_ID=1, WORKSPACE_ID=0 → WS:3748, REST:3747
WORKSPACE_ID=1 → WS:3838, REST:3837
```

### Manual Override

```bash
# In .env file
ORCHESTRATOR_WS_PORT=3738
ORCHESTRATOR_REST_PORT=3737
```

---

## npm Scripts Reference

### Development

```bash
# Start backend (orchestrator starts automatically)
npm run dev:backend

# Start worker (connects to backend's embedded orchestrator)
npm run dev:worker
```

### Production

```bash
# Build all packages
npm run build

# Start backend in production mode
npm run start:backend
```

### Testing

```bash
# Run all tests (uses test mode with mocks)
npm test

# Run specific package tests
npm run test:backend
npm run test:orchestrator-adapters
```

---

## Configuration TypeScript Interface

```typescript
// From packages/orchestrator-adapters/src/OrchestratorClientConfig.ts

/**
 * Library mode configuration
 * Orchestrator runs in-process, direct method calls
 */
export interface LibraryOrchestratorClientConfig {
	mode: 'library';

	/**
	 * WebSocket port for worker connections
	 * @default 3738
	 */
	wsPort?: number;

	/**
	 * REST API port for orchestrator
	 * @default 3737
	 */
	restPort?: number;

	/**
	 * Project root directory
	 * @default process.cwd()
	 */
	projectRoot?: string;
}

/**
 * Test mode configuration
 * Orchestrator is mocked for unit tests
 */
export interface TestOrchestratorClientConfig {
	mode: 'test';

	/**
	 * Optional mock orchestrator instance
	 */
	mockOrchestrator?: any;
}

export type OrchestratorClientConfig = LibraryOrchestratorClientConfig | TestOrchestratorClientConfig;
```

---

## References

- Implementation: `packages/orchestrator-adapters/src/OrchestratorClientFactory.ts`
- Configuration Types: `packages/orchestrator-adapters/src/OrchestratorClientConfig.ts`
- Backend Integration: `packages/web-backend/src/server.ts:42-60`
- Environment Example: `packages/web-backend/.env.example`
