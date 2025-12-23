/**
 * Port calculation utility for parallel development across workspaces and projects
 *
 * Port allocation strategy:
 * - Rest Port (Orchestrator HTTP): BASE_REST_PORT + (workspaceId * 100) + (projectId * 10)
 * - WebSocket Port (Orchestrator WS): REST_PORT + 1
 *
 * Examples:
 * - WORKSPACE_ID=0, PROJECT_ID=0: restPort=3700, wsPort=3701
 * - WORKSPACE_ID=0, PROJECT_ID=1: restPort=3710, wsPort=3711
 * - WORKSPACE_ID=1, PROJECT_ID=0: restPort=3800, wsPort=3801
 * - WORKSPACE_ID=1, PROJECT_ID=1: restPort=3810, wsPort=3811
 */

export interface OrchestratorPorts {
	restPort: number;
	wsPort: number;
}

const BASE_REST_PORT = 3700; // Base port for orchestrator REST endpoints

/**
 * Calculate orchestrator ports based on WORKSPACE_ID and PROJECT_ID
 *
 * @param workspaceId - Workspace identifier (WORKSPACE_ID env var), defaults to 0
 * @param projectId - Project identifier (PROJECT_ID env var), defaults to 0
 * @returns Object with restPort and wsPort
 */
export function calculateOrchestratorPorts(workspaceId: number = 0, projectId: number = 0): OrchestratorPorts {
	const restPort = BASE_REST_PORT + workspaceId * 100 + projectId * 10;
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

	// Fall back to calculating from WORKSPACE_ID and PROJECT_ID
	const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
	const projectId = parseInt(process.env.PROJECT_ID || '0', 10);

	return calculateOrchestratorPorts(workspaceId, projectId);
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
