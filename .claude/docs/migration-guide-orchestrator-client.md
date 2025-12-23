# OrchestratorClient Migration Guide

## Table of Contents

- [Overview](#overview)
- [Before You Start](#before-you-start)
- [Migration Steps](#migration-steps)
- [Testing Strategy](#testing-strategy)
- [Rollback Plan](#rollback-plan)
- [Troubleshooting](#troubleshooting)

---

## Overview

This guide helps you migrate from the previous architecture to the new OrchestratorClient-based architecture.

### What Changed

**Before** (Direct HTTP calls):

```typescript
// Old: Direct HTTP fetch to orchestrator REST API
const response = await fetch(`${ORCHESTRATOR_URL}/stats`);
const stats = await response.json();
```

**After** (OrchestratorClient):

```typescript
// New: Unified client interface
const stats = await orchestratorClient.getStats();
```

### Benefits of Migration

1. **Type Safety**: End-to-end type checking with shared contracts
2. **Flexibility**: Switch between library and remote modes via configuration
3. **Testability**: Mock implementations for fast parallel testing
4. **Reliability**: Automatic transport fallback in remote mode
5. **Maintainability**: Single interface, consistent error handling

---

## Before You Start

### Prerequisites

- Node.js 18+ installed
- pnpm workspaces configured
- All packages building successfully
- Tests passing

### Backup Current State

```bash
# Create a backup branch
git checkout -b backup-before-orchestrator-client-migration
git push origin backup-before-orchestrator-client-migration

# Return to main branch
git checkout main
```

---

## Migration Steps

### Step 1: Update Dependencies

**File**: `packages/web-backend/package.json`

**Add orchestrator-adapters**:

```json
{
	"dependencies": {
		"orchestrator-adapters": "*"
		// ... other dependencies
	},
	"devDependencies": {
		"orchestrator": "*", // Move from dependencies to devDependencies
		"cross-env": "^7.0.3" // Add for Windows compatibility
		// ... other devDependencies
	}
}
```

**Install dependencies**:

```bash
cd packages/web-backend
npm install
```

---

### Step 2: Update DataStoreFactory

**File**: `packages/web-backend/src/factories/DataStoreFactory.ts`

**Before**:

```typescript
export class DataStoreFactory {
	constructor(storageMode: 'memory' | 'mariadb' = 'memory') {
		// ...
	}

	getDashboardService(): DashboardService {
		if (!this.dashboardService) {
			const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:3737';
			const orchestratorRepo = new OrchestratorRepository(orchestratorUrl, 5000);
			this.dashboardService = new DashboardService(orchestratorRepo);
		}
		return this.dashboardService;
	}
}
```

**After**:

```typescript
import type { OrchestratorClient } from 'orchestrator-adapters';

export class DataStoreFactory {
	private orchestratorClient: OrchestratorClient;

	constructor(storageMode: 'memory' | 'mariadb' = 'memory', orchestratorClient: OrchestratorClient) {
		// ...
		this.orchestratorClient = orchestratorClient;
	}

	getOrchestratorClient(): OrchestratorClient {
		return this.orchestratorClient;
	}

	getDashboardService(): DashboardService {
		if (!this.dashboardService) {
			// Use injected client instead of creating OrchestratorRepository
			this.dashboardService = new DashboardService(this.orchestratorClient);
		}
		return this.dashboardService;
	}
}
```

**Changes**:

- Add `orchestratorClient` constructor parameter
- Store client as instance variable
- Add `getOrchestratorClient()` method
- Update services to use client instead of repository

---

### Step 3: Update factory-instance.ts

**File**: `packages/web-backend/src/utils/factory-instance.ts`

**Before**:

```typescript
export function initializeFactory(storageMode: 'memory' | 'mariadb' = 'memory'): DataStoreFactory {
	if (factoryInstance) {
		throw new Error('Factory already initialized');
	}
	factoryInstance = new DataStoreFactory(storageMode);
	return factoryInstance;
}
```

**After**:

```typescript
import type { OrchestratorClient } from 'orchestrator-adapters';

export function initializeFactory(
	storageMode: 'memory' | 'mariadb' = 'memory',
	orchestratorClient: OrchestratorClient
): DataStoreFactory {
	if (factoryInstance) {
		throw new Error('Factory already initialized');
	}
	factoryInstance = new DataStoreFactory(storageMode, orchestratorClient);
	return factoryInstance;
}
```

**Changes**:

- Add `orchestratorClient` parameter
- Pass client to DataStoreFactory constructor

---

### Step 4: Create initializeOrchestratorClient Function

**File**: `packages/web-backend/src/server.ts`

**Add at top**:

```typescript
import { OrchestratorClientFactory } from 'orchestrator-adapters';
import type { OrchestratorClient } from 'orchestrator-adapters';
```

**Add function before `start()`**:

```typescript
async function initializeOrchestratorClient(): Promise<OrchestratorClient> {
	const mode = process.env.ORCHESTRATOR_MODE || 'library';

	if (mode === 'library') {
		logger.info('[Orchestrator] Initializing in library mode (embedded)');

		// @ts-expect-error - orchestrator is a devDependency, only available at runtime in library mode
		const { Orchestrator } = await import('orchestrator/core/index.js');

		const orchestratorWsPort = parseInt(process.env.ORCHESTRATOR_WS_PORT || '3738', 10);
		const orchestratorRestPort = parseInt(process.env.ORCHESTRATOR_REST_PORT || '3737', 10);

		const orchestrator = new Orchestrator({
			wsPort: orchestratorWsPort,
			restPort: orchestratorRestPort,
		});

		await orchestrator.start();
		logger.info(`[Orchestrator] Started on WS port ${orchestratorWsPort}, REST port ${orchestratorRestPort}`);

		const orchestratorClient = await OrchestratorClientFactory.create({ mode: 'library' }, orchestrator);

		await orchestratorClient.connect();
		logger.info('[Orchestrator] LibraryAdapter connected');

		return orchestratorClient;
	} else if (mode === 'remote') {
		const url = process.env.ORCHESTRATOR_URL;
		if (!url) {
			throw new Error('ORCHESTRATOR_URL is required when ORCHESTRATOR_MODE=remote');
		}

		logger.info(`[Orchestrator] Initializing in remote mode (URL: ${url})`);

		const transportMode = (process.env.ORCHESTRATOR_TRANSPORT as any) || 'auto';

		const orchestratorClient = await OrchestratorClientFactory.create({
			mode: 'remote',
			url,
			transportMode,
		});

		await orchestratorClient.connect();
		logger.info('[Orchestrator] RemoteAdapter connected');

		return orchestratorClient;
	} else {
		throw new Error(`Invalid ORCHESTRATOR_MODE: ${mode}. Must be 'library' or 'remote'.`);
	}
}
```

---

### Step 5: Update start() Function

**File**: `packages/web-backend/src/server.ts`

**Before** (in `start()` function):

```typescript
const factory = initializeFactory('memory');
```

**After** (in `start()` function):

```typescript
// Initialize OrchestratorClient (library or remote mode)
const orchestratorClient = await initializeOrchestratorClient();

// Initialize global factory with orchestratorClient
const factory = initializeFactory('memory', orchestratorClient);
```

**Update all factory initialization calls**:

```typescript
// Production DB mode
if (process.env.USE_PRODUCTION_DB === 'true') {
	const factory = initializeFactory('memory', orchestratorClient);
	// ...
}

// Development mode
else if (process.env.E2E_MODE !== 'true') {
	const factory = initializeFactory('memory', orchestratorClient);
	// ...
}

// E2E mode
else {
	const factory = initializeFactory('memory', orchestratorClient);
	// ...
}
```

---

### Step 6: Update Services

**For each service using OrchestratorRepository**, replace with OrchestratorClient.

#### Example: DashboardService

**Before**:

```typescript
export class DashboardService {
	constructor(private orchestratorRepository: OrchestratorRepository) {}

	async getOrchestratorStats(): Promise<OrchestratorStats> {
		return this.orchestratorRepository.getStats();
	}
}
```

**After**:

```typescript
import type { OrchestratorClient } from 'orchestrator-adapters';

export class DashboardService {
	constructor(private orchestratorClient: OrchestratorClient) {}

	async getOrchestratorStats(): Promise<OrchestratorStats> {
		return this.orchestratorClient.getStats();
	}
}
```

#### Example: TasksService

**Before**:

```typescript
export class TasksService {
	constructor(
		private orchestratorRepository: OrchestratorRepository,
		private eventBroadcaster: EventBroadcaster
	) {}

	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		const response = await fetch(`${this.orchestratorUrl}/tasks`, {
			method: 'POST',
			body: JSON.stringify({ description, metadata }),
		});
		return response.json();
	}
}
```

**After**:

```typescript
import type { OrchestratorClient } from 'orchestrator-adapters';

export class TasksService {
	constructor(
		private orchestratorClient: OrchestratorClient,
		private eventBroadcaster: EventBroadcaster
	) {
		// Subscribe to orchestrator events
		this.orchestratorClient.on('task.created', data => {
			this.eventBroadcaster.broadcast('task:created', data.task);
		});

		this.orchestratorClient.on('task.updated', data => {
			this.eventBroadcaster.broadcast('task:updated', data.task);
		});
	}

	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		return this.orchestratorClient.createTask(description, metadata);
	}

	async getTask(taskId: string): Promise<Task | null> {
		return this.orchestratorClient.getTask(taskId);
	}

	async getTasks(filters?: TaskFilters): Promise<Task[]> {
		return this.orchestratorClient.getTasks(filters);
	}
}
```

**Changes**:

- Replace `OrchestratorRepository` with `OrchestratorClient`
- Subscribe to events in constructor
- Use client methods instead of fetch calls

---

### Step 7: Update .env File

**File**: `packages/web-backend/.env`

**Add new environment variables**:

```bash
# ===========================================================================================
# Orchestrator Configuration
# ===========================================================================================

# Orchestrator Mode: 'library' or 'remote'
ORCHESTRATOR_MODE=library

# Remote Mode Configuration (only used when ORCHESTRATOR_MODE=remote)
ORCHESTRATOR_URL=http://localhost:3737
ORCHESTRATOR_TRANSPORT=auto

# Library Mode Configuration (only used when ORCHESTRATOR_MODE=library)
ORCHESTRATOR_WS_PORT=3738
ORCHESTRATOR_REST_PORT=3737
```

---

### Step 8: Update Tests

#### Replace OrchestratorRepository with MockOrchestratorClient

**Before**:

```typescript
describe('DashboardService', () => {
	let orchestratorRepo: OrchestratorRepository;
	let dashboardService: DashboardService;

	beforeEach(() => {
		orchestratorRepo = new OrchestratorRepository('http://localhost:3737', 5000);
		dashboardService = new DashboardService(orchestratorRepo);
	});

	test('should fetch stats', async () => {
		// Mock fetch
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ workers: 5, tasks: { total: 10 } }),
		});

		const stats = await dashboardService.getOrchestratorStats();
		expect(stats.workers).toBe(5);
	});
});
```

**After**:

```typescript
import { MockOrchestratorClient } from 'orchestrator-adapters/__mocks__/MockOrchestratorClient';

describe('DashboardService', () => {
	let mockClient: MockOrchestratorClient;
	let dashboardService: DashboardService;

	beforeEach(() => {
		mockClient = new MockOrchestratorClient();
		dashboardService = new DashboardService(mockClient);
	});

	test('should fetch stats', async () => {
		// Configure mock response
		mockClient.setMockResponse('getStats', {
			workers: 5,
			tasks: { total: 10, byStatus: {} },
			restPort: 3737,
			wsPort: 3738,
			uptime: 3600,
			workersList: [],
		});

		const stats = await dashboardService.getOrchestratorStats();
		expect(stats.workers).toBe(5);
		expect(mockClient.callHistory).toHaveLength(1);
		expect(mockClient.callHistory[0].method).toBe('getStats');
	});
});
```

**Changes**:

- Import `MockOrchestratorClient`
- Replace `OrchestratorRepository` with `MockOrchestratorClient`
- Use `setMockResponse()` instead of mocking fetch
- Verify call history for better test assertions

---

## Testing Strategy

### Unit Tests

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Target: >70% coverage, >90% for business logic
```

### Integration Tests

```bash
# Test library mode
ORCHESTRATOR_MODE=library npm run dev:debug

# Test remote mode (requires orchestrator-server)
# Terminal 1:
cd packages/orchestrator-server
npm run dev

# Terminal 2:
ORCHESTRATOR_MODE=remote ORCHESTRATOR_URL=http://localhost:3737 npm run dev:debug
```

### E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# Should work in both library and remote modes
```

---

## Rollback Plan

If issues arise during migration, you can rollback:

### Quick Rollback (Git)

```bash
# Revert to backup branch
git checkout backup-before-orchestrator-client-migration

# Or reset to specific commit
git reset --hard <commit-before-migration>
```

### Gradual Rollback (Feature Flag)

Add a feature flag to toggle between old and new implementation:

```typescript
// In server.ts
const USE_NEW_CLIENT = process.env.USE_ORCHESTRATOR_CLIENT === 'true';

if (USE_NEW_CLIENT) {
	// New: OrchestratorClient
	const orchestratorClient = await initializeOrchestratorClient();
	const factory = initializeFactory('memory', orchestratorClient);
} else {
	// Old: Direct HTTP
	const factory = initializeFactory('memory');
}
```

---

## Troubleshooting

### Issue: "Cannot find module 'orchestrator'"

**Cause**: orchestrator package not installed in library mode.

**Solution**:

```bash
cd packages/web-backend
npm install orchestrator --save-dev
```

---

### Issue: "ORCHESTRATOR_URL is required"

**Cause**: Remote mode selected but ORCHESTRATOR_URL not set.

**Solution**:

```bash
# Set in .env file
ORCHESTRATOR_URL=http://localhost:3737

# Or pass as environment variable
ORCHESTRATOR_URL=http://localhost:3737 npm run dev:remote
```

---

### Issue: "Connection refused" in Remote Mode

**Cause**: orchestrator-server not running.

**Solution**:

```bash
# Start orchestrator-server first
cd packages/orchestrator-server
npm run dev

# Then start backend
cd packages/web-backend
npm run dev:remote
```

---

### Issue: Tests failing with "MockOrchestratorClient not found"

**Cause**: Mock path incorrect or package not built.

**Solution**:

```bash
# Build orchestrator-adapters
cd packages/orchestrator-adapters
npm run build

# Update import path
import { MockOrchestratorClient } from 'orchestrator-adapters/__mocks__/MockOrchestratorClient';
```

---

### Issue: TypeScript errors with dynamic import

**Cause**: TypeScript can't resolve orchestrator types at compile time.

**Solution**: Add `@ts-expect-error` comment:

```typescript
// @ts-expect-error - orchestrator is a devDependency, only available at runtime in library mode
const { Orchestrator } = await import('orchestrator/core/index.js');
```

---

## Next Steps

After successful migration:

1. **Monitor Performance**: Compare latency metrics before/after
2. **Test Both Modes**: Verify library and remote modes work correctly
3. **Update Documentation**: Document any project-specific changes
4. **Train Team**: Share knowledge about new architecture
5. **Plan Remote Deployment**: Prepare for production remote mode deployment

## Related Documentation

- [Architecture Overview](./backend-orchestrator-transport.md) - Design details
- [Usage Guide](./orchestrator-client-usage.md) - Implementation examples
- [Configuration Reference](./orchestrator-client-configuration.md) - Environment variables
