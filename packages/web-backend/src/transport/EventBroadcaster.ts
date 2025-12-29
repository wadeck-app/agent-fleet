import type { EventData, EventType } from '@app/shared/transport';

import type { ITransportServer } from './ITransportServer';
import type { MessageQueue } from './MessageQueue';
import type { TransportSessionManager } from './TransportSessionManager';

/**
 * ===========================================================================================
 * EVENT BROADCASTER - MULTI-TRANSPORT EVENT BROADCASTING SERVICE
 * ===========================================================================================
 *
 * Broadcasts events to multiple transport types (WebSocket, SSE, Long Polling).
 * Provides convenience methods for broadcasting events to clients.
 *
 * Features:
 * - Type-safe event emission using EventTypes
 * - Broadcast to all transports simultaneously
 * - Send to specific client (auto-detects transport type)
 * - Send to all sessions of a specific user (multi-device support)
 * - Automatic subscription filtering via TransportSessionManager
 * - Message queue for polling transports
 *
 * Anti-fragile design:
 * - Each transport is independent
 * - Failure in one transport doesn't affect others
 * - Automatic fallback to message queue if delivery fails
 *
 * Architecture:
 * Service → EventBroadcaster → [WebSocket, SSE, LongPolling] → Clients
 *
 * @example
 * ```typescript
 * // In a service
 * async createTask(data: CreateTaskDto): Promise<Task> {
 *   const task = await this.repository.createTask(data);
 *
 *   // Broadcast to all subscribed clients across ALL transports
 *   this.eventBroadcaster.broadcast('task:created', task);
 *
 *   return task;
 * }
 * ```
 *
 * ===========================================================================================
 */
export class EventBroadcaster {
	/**
	 * Transport servers (WebSocket, SSE, Long Polling, etc.)
	 */
	private transportServers: ITransportServer[];

	/**
	 * Primary transport (for backward compatibility)
	 */
	private primaryTransport: ITransportServer;

	constructor(
		transportServers: ITransportServer | ITransportServer[],
		private sessionManager: TransportSessionManager,
		private messageQueue?: MessageQueue
	) {
		// Support both single and multiple transports
		this.transportServers = Array.isArray(transportServers) ? transportServers : [transportServers];
		this.primaryTransport = this.transportServers[0];
	}

	/**
	 * Broadcast event to all connected clients across ALL transports
	 * Server-side subscription filtering is applied automatically
	 *
	 * Anti-fragile: Broadcasts to all transports independently.
	 * If one transport fails, others continue.
	 *
	 * @param event - Event type (e.g., 'b2f:task:created', 'b2f:worker:heartbeat')
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * broadcaster.broadcast('b2f:task:created', {
	 *   id: '123',
	 *   name: 'New task',
	 *   status: 'pending',
	 *   // ... other task fields
	 * });
	 * ```
	 */
	//TODO normally never used, in favor of braodcastExcept as we do not want to inform the source of the event about that said event
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		console.log(`[EventBroadcaster] Broadcasting event "${event}" to ${this.transportServers.length} transport(s)`);
		// Broadcast to all transports
		for (const transport of this.transportServers) {
			try {
				transport.broadcast(event, data);
				//TODO implement .name method in transport and use it
				console.log(`[EventBroadcaster] Successfully broadcast to transport`);
			} catch (error) {
				console.error(`[EventBroadcaster] Failed to broadcast to transport:`, error);
				// Continue with other transports (anti-fragile)
			}
		}
	}

	/**
	 * Broadcast event to all connected clients EXCEPT the specified connection
	 * Prevents "broadcast echo" - client that triggered the event won't receive it
	 *
	 * Use case: Client makes API call that triggers broadcast event.
	 * Client already has the data from API response, so it shouldn't receive the broadcast.
	 *
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 * @param excludeConnId - Connection ID to exclude (optional, from X-Conn-Id header)
	 *
	 * @example
	 * ```typescript
	 * // In WorkersService.updateWorkerName
	 * async updateWorkerName(workerId: string, name: string, version: number, connId?: string) {
	 *   const updatedWorker = await this.repository.update(...);
	 *
	 *   // Broadcast to all clients EXCEPT the one that made the update
	 *   this.eventBroadcaster.broadcastExcept('b2f:worker:updated', updatedWorker, connId);
	 *
	 *   return updatedWorker;
	 * }
	 * ```
	 */
	broadcastExcept<E extends EventType>(event: E, data: EventData<E>, excludeConnId?: string): void {
		if (!excludeConnId) {
			// No exclusion needed, use regular broadcast
			this.broadcast(event, data);
			return;
		}

		console.log(
			`[EventBroadcaster] Broadcasting event "${event}" (excluding connId: ${excludeConnId.substring(0, 8)}...)`
		);

		// Get all connected connections from all transports
		const allConnections = this.getConnectedClients();

		// Filter out the excluded connId
		const targetConnections = allConnections.filter(connId => connId !== excludeConnId);

		if (targetConnections.length >= 3) {
			console.log(`[EventBroadcaster] Sending to ${targetConnections.length} connections (excluded 1)`);
		} else {
			console.log(
				`[EventBroadcaster] Sending to ${targetConnections.length} connections (excluded 1): ${targetConnections.map(connId => connId.substring(0, 8)).join(', ')}`
			);
		}

		// Send to each connection individually
		for (const connId of targetConnections) {
			try {
				this.sendToClient(connId, event, data);
			} catch (error) {
				console.error(`[EventBroadcaster] Failed to send to connection ${connId}:`, error);
				// Continue with other connections (anti-fragile)
			}
		}
	}

	/**
	 * Send event to specific connection
	 * Routes directly to the correct transport based on session manager
	 *
	 * @param connId - Connection ID to send to
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * broadcaster.sendToClient(connId, 'b2f:task:assigned', {
	 *   taskId: '123',
	 *   workerId: 'worker-1',
	 *   assignedAt: Date.now(),
	 * });
	 * ```
	 */
	sendToClient<E extends EventType>(connId: string, event: E, data: EventData<E>): void {
		// Get transport type for this connection from session manager
		const transportType = this.sessionManager.getTransportType(connId);

		if (!transportType) {
			// Connection not found in session manager - queue for later delivery
			if (this.messageQueue) {
				console.warn(
					`[EventBroadcaster] Connection ${connId} not found in session manager, queuing event ${event}`
				);
				this.messageQueue.enqueue(connId, {
					id: `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
					type: event,
					data,
					timestamp: Date.now(),
				});
			}
			return;
		}

		// Find the transport server that handles this transport type
		const transport = this.findTransportByType(transportType);

		if (!transport) {
			console.error(`[EventBroadcaster] No transport server found for type: ${transportType}`);
			return;
		}

		// Send directly to the correct transport
		transport.sendToClient(connId, event, data);
	}

	/**
	 * Send event to all sessions of a specific user
	 * Supports multi-device scenarios where one user has multiple connections
	 *
	 * @param userId - User ID to send to
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * // User completes a task on mobile, notify all their devices
	 * broadcaster.sendToUser(userId, 'task:completed', {
	 *   taskId: '123',
	 *   completedAt: Date.now(),
	 * });
	 * ```
	 */
	sendToUser<E extends EventType>(userId: string, event: E, data: EventData<E>): void {
		// Get all sessions for this user
		const sessions = this.sessionManager.getUserSessions(userId);

		// Send to each session's connection
		sessions.forEach(session => {
			this.sendToClient(session.connId, event, data);
		});
	}

	/**
	 * Get number of connected connections across ALL transports
	 *
	 * @returns Number of connected connections
	 */
	getConnectedClientsCount(): number {
		const allConnections = new Set<string>();
		for (const transport of this.transportServers) {
			transport.getConnectedClients().forEach(connId => allConnections.add(connId));
		}
		return allConnections.size;
	}

	/**
	 * Get all connected connection IDs across ALL transports
	 *
	 * @returns Array of unique connection IDs
	 */
	getConnectedClients(): string[] {
		const allConnections = new Set<string>();
		for (const transport of this.transportServers) {
			const transportConnections = transport.getConnectedClients();
			console.log(
				`[EventBroadcaster] Transport ${transport.getTransportType()}: ${transportConnections.length} connections`,
				transportConnections.map(c => c.substring(0, 8))
			);
			transportConnections.forEach(connId => allConnections.add(connId));
		}
		console.log(`[EventBroadcaster] Total unique connections: ${allConnections.size}`);
		return Array.from(allConnections);
	}

	/**
	 * Get transport distribution statistics
	 *
	 * @returns Statistics about client connections by transport type
	 */
	getTransportStats() {
		return this.sessionManager.getTransportStats();
	}

	/**
	 * Find transport server by transport type
	 *
	 * Maps transport types to their corresponding transport server implementation.
	 *
	 * @param transportType - Type of transport (websocket, sse, long-polling, http, mock)
	 * @returns Transport server or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const transport = broadcaster.findTransportByType('sse');
	 * if (transport) {
	 *   transport.sendToClient(connId, event, data);
	 * }
	 * ```
	 */
	private findTransportByType(transportType: string): ITransportServer | undefined {
		// Find the transport server that matches this transport type
		for (const transport of this.transportServers) {
			if (transport.getTransportType() === transportType) {
				return transport;
			}
		}
		return undefined;
	}
}
