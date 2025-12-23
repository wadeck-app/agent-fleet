/**
 * ===========================================================================================
 * ORCHESTRATOR EVENT BROADCASTER
 * ===========================================================================================
 *
 * Broadcasts O→B events from orchestrator to connected backend clients.
 * Maps StateManager events to O2B event types.
 *
 * Features:
 * - Automatic event subscription to StateManager
 * - Type-safe O→B event broadcasting
 * - Client subscription filtering (only send events client subscribed to)
 * - Multi-client support
 *
 * Event mapping:
 * - StateEvent.TASK_CREATED → task.created
 * - StateEvent.TASK_UPDATED → task.updated
 * - StateEvent.WORKER_CONNECTED → worker.connected
 * - StateEvent.WORKER_DISCONNECTED → worker.disconnected
 * - StateEvent.WORKER_STATUS_CHANGED → worker.status
 * - (more mappings as needed)
 *
 * ===========================================================================================
 */
import { StateEvent } from 'shared-common/StateManager.js';
import type { O2BEvent } from 'shared-orch-backend';

import { Orchestrator } from '../core/index.js';

/**
 * Client connection with subscription info
 */
export interface ClientConnection {
	clientId: string;
	subscribedEvents: Set<string>;
	send: (event: O2BEvent) => Promise<void>;
}

/**
 * Orchestrator Event Broadcaster
 *
 * Listens to StateManager events and broadcasts them as O→B events to clients.
 */
export class OrchestratorEventBroadcaster {
	private clients = new Map<string, ClientConnection>();

	constructor(private orchestrator: Orchestrator) {
		this.setupEventListeners();
	}

	/**
	 * Set up listeners on StateManager events
	 */
	private setupEventListeners(): void {
		const stateManager = (this.orchestrator as any).stateManager;

		// Task events
		stateManager.on(StateEvent.TASK_CREATED, (eventData: any) => {
			this.broadcast({
				type: 'task.created',
				data: {
					taskId: eventData.task.id,
					task: eventData.task,
					timestamp: new Date().toISOString(),
				},
			});
		});

		stateManager.on(StateEvent.TASK_UPDATED, (eventData: any) => {
			this.broadcast({
				type: 'task.updated',
				data: {
					taskId: eventData.task.id,
					task: eventData.task,
					timestamp: new Date().toISOString(),
				},
			});
		});

		// Worker events (map from StateManager events)
		// Note: StateManager might not have all worker events,
		// so we'll need to listen to WorkerWebSocketServer events as well
		const wsServer = this.orchestrator.getWsServer();
		if (wsServer) {
			// Worker connected
			stateManager.on(StateEvent.WORKER_CONNECTED, (eventData: any) => {
				this.broadcast({
					type: 'worker.connected',
					data: {
						workerId: eventData.workerId,
						workerType: eventData.workerType,
						connectedAt: new Date().toISOString(),
						timestamp: new Date().toISOString(),
					},
				});
			});

			// Worker disconnected
			stateManager.on(StateEvent.WORKER_DISCONNECTED, (eventData: any) => {
				this.broadcast({
					type: 'worker.disconnected',
					data: {
						workerId: eventData.workerId,
						reason: eventData.reason,
						timestamp: new Date().toISOString(),
					},
				});
			});

			// Worker task assigned (status change to busy)
			stateManager.on(StateEvent.WORKER_TASK_ASSIGNED, (eventData: any) => {
				this.broadcast({
					type: 'worker.status',
					data: {
						workerId: eventData.workerId,
						status: 'busy' as any,
						taskId: eventData.taskId,
						timestamp: new Date().toISOString(),
					},
				});
			});

			// Worker task released (status change to idle)
			stateManager.on(StateEvent.WORKER_TASK_RELEASED, (eventData: any) => {
				this.broadcast({
					type: 'worker.status',
					data: {
						workerId: eventData.workerId,
						status: 'idle' as any,
						taskId: null,
						timestamp: new Date().toISOString(),
					},
				});
			});
		}

		console.log('[EventBroadcaster] Event listeners set up');
	}

	// ===========================================================================================
	// CLIENT MANAGEMENT
	// ===========================================================================================

	/**
	 * Register a client connection
	 *
	 * @param clientId - Unique client ID
	 * @param send - Function to send events to this client
	 * @returns Client connection object
	 */
	registerClient(clientId: string, send: (event: O2BEvent) => Promise<void>): ClientConnection {
		const client: ClientConnection = {
			clientId,
			subscribedEvents: new Set(),
			send,
		};

		this.clients.set(clientId, client);
		console.log(`[EventBroadcaster] Client registered: ${clientId}`);

		return client;
	}

	/**
	 * Unregister a client connection
	 *
	 * @param clientId - Client ID to unregister
	 */
	unregisterClient(clientId: string): void {
		this.clients.delete(clientId);
		console.log(`[EventBroadcaster] Client unregistered: ${clientId}`);
	}

	/**
	 * Update client subscriptions
	 *
	 * @param clientId - Client ID
	 * @param eventTypes - Event types to subscribe to
	 */
	subscribe(clientId: string, eventTypes: string[]): void {
		const client = this.clients.get(clientId);
		if (!client) {
			console.warn(`[EventBroadcaster] Client not found: ${clientId}`);
			return;
		}

		eventTypes.forEach(eventType => {
			client.subscribedEvents.add(eventType);
		});

		console.log(`[EventBroadcaster] Client ${clientId} subscribed to:`, eventTypes);
	}

	/**
	 * Remove client subscriptions
	 *
	 * @param clientId - Client ID
	 * @param eventTypes - Event types to unsubscribe from
	 */
	unsubscribe(clientId: string, eventTypes: string[]): void {
		const client = this.clients.get(clientId);
		if (!client) {
			return;
		}

		eventTypes.forEach(eventType => {
			client.subscribedEvents.delete(eventType);
		});

		console.log(`[EventBroadcaster] Client ${clientId} unsubscribed from:`, eventTypes);
	}

	// ===========================================================================================
	// EVENT BROADCASTING
	// ===========================================================================================

	/**
	 * Broadcast event to all subscribed clients
	 *
	 * @param event - O→B event to broadcast
	 */
	broadcast(event: O2BEvent): void {
		let sentCount = 0;

		for (const [clientId, client] of this.clients.entries()) {
			// Check if client subscribed to this event type (or subscribed to all if empty)
			if (client.subscribedEvents.size === 0 || client.subscribedEvents.has(event.type)) {
				client
					.send(event)
					.then(() => {
						sentCount++;
					})
					.catch(error => {
						console.error(`[EventBroadcaster] Failed to send event to client ${clientId}:`, error);
					});
			}
		}

		if (sentCount > 0) {
			console.log(`[EventBroadcaster] Broadcasted ${event.type} to ${sentCount} clients`);
		}
	}

	/**
	 * Send event to specific client
	 *
	 * @param clientId - Client ID
	 * @param event - O→B event to send
	 */
	async sendToClient(clientId: string, event: O2BEvent): Promise<void> {
		const client = this.clients.get(clientId);
		if (!client) {
			throw new Error(`Client not found: ${clientId}`);
		}

		await client.send(event);
	}

	/**
	 * Get number of connected clients
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Get all client IDs
	 */
	getClientIds(): string[] {
		return Array.from(this.clients.keys());
	}
}
