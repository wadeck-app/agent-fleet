/**
 * Port calculation utility for parallel development across projects, workspaces, and workers
 *
 * Port allocation strategy (hierarchical):
 * - Rest Port (Orchestrator HTTP): BASE_REST_PORT + (projectId * 1000) + (workspaceId * 100) + (workerId * 10)
 * - WebSocket Port (Orchestrator WS): REST_PORT + 1
 *
 * Hierarchy: PROJECT_ID (most impact) > WORKSPACE_ID (medium) > WORKER_ID (least, when present)
 *
 * Examples (without workerId):
 * - PROJECT_ID=0, WORKSPACE_ID=0: restPort=7000, wsPort=7001
 * - PROJECT_ID=0, WORKSPACE_ID=1: restPort=7100, wsPort=7101
 * - PROJECT_ID=1, WORKSPACE_ID=0: restPort=8000, wsPort=8001
 *
 * Examples (with workerId for E2E parallel workers):
 * - PROJECT_ID=0, WORKSPACE_ID=0, WORKER_ID=0: restPort=7000, wsPort=7001
 * - PROJECT_ID=0, WORKSPACE_ID=0, WORKER_ID=1: restPort=7010, wsPort=7011
 * - PROJECT_ID=0, WORKSPACE_ID=0, WORKER_ID=2: restPort=7020, wsPort=7021
 * - PROJECT_ID=0, WORKSPACE_ID=1, WORKER_ID=0: restPort=7100, wsPort=7101
 * - PROJECT_ID=1, WORKSPACE_ID=0, WORKER_ID=0: restPort=8000, wsPort=8001
 */

export interface OrchestratorPorts {
	restPort: number;
	wsPort: number;
}

const BASE_REST_PORT = 7000; // Base port for orchestrator REST/WebSocket endpoints (avoids common port conflicts)

/**
 * Calculate orchestrator ports based on WORKSPACE_ID, PROJECT_ID, and optionally WORKER_ID
 *
 * @param workspaceId - Workspace identifier (WORKSPACE_ID env var), defaults to 0
 * @param projectId - Project identifier (PROJECT_ID env var), defaults to 0
 * @param workerId - Worker identifier (WORKER_ID env var) for parallel E2E tests, defaults to 0
 * @returns Object with restPort and wsPort
 */
export function calculateOrchestratorPorts(
	workspaceId: number = 0,
	projectId: number = 0,
	workerId: number = 0
): OrchestratorPorts {
	// Hierarchical port allocation: PROJECT > WORKSPACE > WORKER
	// projectId * 1000: Allows 10 projects (0-9) with full isolation
	// workspaceId * 100: Allows 10 workspaces per project (0-9)
	// workerId * 10: Allows 10 workers per workspace (0-9)
	const restPort = BASE_REST_PORT + projectId * 1000 + workspaceId * 100 + workerId * 10;
	const wsPort = restPort + 1;

	return { restPort, wsPort };
}

/**
 * Get orchestrator ports from environment variables with fallback calculation
 *
 * Checks for environment-specific port variables first:
 * - ORCHESTRATOR_REST_PORT: explicit override for REST port
 * - ORCHESTRATOR_WS_PORT: explicit override for WS port
 *
 * Falls back to calculating from:
 * - WORKSPACE_ID (default: 0)
 * - PROJECT_ID (default: 0)
 * - WORKER_ID (default: 0, used for parallel E2E workers)
 *
 * @returns Object with restPort and wsPort
 */
export function getOrchestratorPortsFromEnv(): OrchestratorPorts {
	// Check for explicit port overrides first
	if (process.env.ORCHESTRATOR_REST_PORT) {
		const restPort = parseInt(process.env.ORCHESTRATOR_REST_PORT, 10);
		const wsPort = process.env.ORCHESTRATOR_WS_PORT ? parseInt(process.env.ORCHESTRATOR_WS_PORT, 10) : restPort + 1;
		return { restPort, wsPort };
	}

	// Fall back to calculating from WORKSPACE_ID, PROJECT_ID, and WORKER_ID
	const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
	const projectId = parseInt(process.env.PROJECT_ID || '0', 10);
	const workerId = parseInt(process.env.WORKER_ID || '0', 10);

	return calculateOrchestratorPorts(workspaceId, projectId, workerId);
}

/**
 * Get orchestrator REST port URL
 *
 * @param host - Hostname (default: localhost)
 * @returns Full URL for REST endpoint (e.g., http://localhost:3700)
 */
export function getOrchestratorRestUrl(host: string = 'localhost'): string {
	const { restPort } = getOrchestratorPortsFromEnv();
	return `http://${host}:${restPort}`;
}

/**
 * Get orchestrator WebSocket URL
 *
 * @param host - Hostname (default: localhost)
 * @param path - WebSocket path (default: /ws)
 * @returns Full URL for WebSocket endpoint (e.g., ws://localhost:3701/ws)
 */
export function getOrchestratorWsUrl(host: string = 'localhost', path: string = '/ws'): string {
	const { wsPort } = getOrchestratorPortsFromEnv();
	return `ws://${host}:${wsPort}${path}`;
}
