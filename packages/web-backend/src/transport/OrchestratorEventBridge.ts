import type { OrchestratorClient } from 'orchestrator-adapters';
import type { O2BEventData } from 'shared-orch-worker/index.js';

import type { Worker } from '@app/shared';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED } from '@app/shared';

import { logger } from '../utils/logger';
import type { EventBroadcaster } from './EventBroadcaster';

/**
 * ===========================================================================================
 * ORCHESTRATOR EVENT BRIDGE
 * ===========================================================================================
 *
 * Bridges Orchestrator-to-Backend (O2B) events to Backend-to-Frontend (B2F) events.
 * Listens to worker lifecycle events from the orchestrator and broadcasts them to
 * connected frontend clients via WebSocket.
 *
 * Responsibilities:
 * - Subscribe to O2B worker lifecycle events (worker.connected, worker.disconnected)
 * - Transform O2B event data to B2F Worker format
 * - Broadcast B2F events to all connected clients
 * - Handle errors gracefully without crashing the server
 *
 * Architecture:
 * OrchestratorClient (O2B events) → OrchestratorEventBridge → EventBroadcaster (B2F events) → WebSocket clients
 *
 * Lifecycle:
 * 1. Create bridge with OrchestratorClient and EventBroadcaster
 * 2. Call initialize() to subscribe to O2B events
 * 3. Bridge automatically forwards events to frontend
 * 4. Call dispose() during shutdown to clean up subscriptions
 *
 * @example
 * ```typescript
 * const bridge = new OrchestratorEventBridge(orchestratorClient, eventBroadcaster);
 * bridge.initialize(); // Start forwarding events
 *
 * // Later, during shutdown:
 * bridge.dispose(); // Clean up event listeners
 * ```
 *
 * ===========================================================================================
 */
export class OrchestratorEventBridge {
	constructor(
		private orchestratorClient: OrchestratorClient,
		private eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Initialize event subscriptions
	 * Subscribes to O2B worker lifecycle events and starts forwarding them to frontend
	 *
	 * Must be called after orchestratorClient is connected
	 */
	initialize(): void {
		// Subscribe to O2B worker lifecycle events
		// Using .bind(this) to preserve context for later removal in dispose()
		this.orchestratorClient.on('worker.connected', this.handleWorkerConnected.bind(this));
		this.orchestratorClient.on('worker.disconnected', this.handleWorkerDisconnected.bind(this));
	}

	/**
	 * Cleanup event subscriptions
	 * Removes all O2B event listeners to prevent memory leaks
	 *
	 * Must be called during server shutdown
	 */
	dispose(): void {
		this.orchestratorClient.off('worker.connected', this.handleWorkerConnected);
		this.orchestratorClient.off('worker.disconnected', this.handleWorkerDisconnected);
	}

	/**
	 * Handle worker.connected O2B event
	 * Transforms event data to Worker format and broadcasts B2F event
	 *
	 * @param data - O2B worker.connected event data
	 */
	private handleWorkerConnected(data: O2BEventData<'worker.connected'>): void {
		try {
			// Validate required fields
			if (!data.workerId || !data.workerType) {
				logger.warn('[Bridge] Invalid worker.connected event data: missing workerId or workerType', data);
				return;
			}

			// Transform O2B data to B2F Worker format
			const worker: Worker = {
				workerId: data.workerId,
				type: data.workerType,
				connected: true,
				state: 'idle', // New workers start in idle state
				taskId: undefined, // No task assigned yet
				uptime: undefined, // MVP: not tracked yet
				lastHeartbeat: undefined, // MVP: not tracked yet
				tasksCompleted: undefined, // MVP: not tracked yet
				successRate: undefined, // MVP: not tracked yet
			};

			// Broadcast B2F event to all connected clients
			this.eventBroadcaster.broadcast(B2F_WORKER_CONNECTED, worker);

			logger.debug(`[Bridge] Broadcasted worker.connected for ${data.workerId}`);
		} catch (error) {
			// Never crash the server - log error and continue
			logger.error('[Bridge] Failed to handle worker.connected event:', error);
		}
	}

	/**
	 * Handle worker.disconnected O2B event
	 * Transforms event data to Worker format and broadcasts B2F event
	 *
	 * Note: O2B disconnect event doesn't include workerType, so we use '<unknown>' placeholder
	 * Frontend should handle this gracefully or track worker types client-side
	 *
	 * @param data - O2B worker.disconnected event data
	 */
	private handleWorkerDisconnected(data: O2BEventData<'worker.disconnected'>): void {
		try {
			// Validate required fields
			if (!data.workerId) {
				logger.warn('[Bridge] Invalid worker.disconnected event data: missing workerId', data);
				return;
			}

			// Transform O2B data to B2F Worker format
			// Note: workerType not available in disconnect event, using placeholder
			const worker: Worker = {
				workerId: data.workerId,
				type: '<unknown>', // O2B disconnect event doesn't include workerType
				connected: false,
				state: 'idle', // Disconnected workers are idle
				taskId: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
			};

			// Broadcast B2F event to all connected clients
			this.eventBroadcaster.broadcast(B2F_WORKER_DISCONNECTED, worker);

			logger.debug(`[Bridge] Broadcasted worker.disconnected for ${data.workerId}`);
		} catch (error) {
			// Never crash the server - log error and continue
			logger.error('[Bridge] Failed to handle worker.disconnected event:', error);
		}
	}
}
