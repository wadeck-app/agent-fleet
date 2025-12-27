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

		// Get all connected clients from all transports
		const allClients = this.getConnectedClients();

		// Filter out the excluded connId
		const targetClients = allClients.filter(clientId => clientId !== excludeConnId);

		if (targetClients.length >= 3) {
			console.log(`[EventBroadcaster] Sending to ${targetClients.length} clients (excluded 1)`);
		} else {
			console.log(
				`[EventBroadcaster] Sending to ${targetClients.length} clients (excluded 1): ${targetClients.map(clientId => clientId.substring(0, 8)).join(', ')}`
			);
		}

		// Send to each client individually
		for (const clientId of targetClients) {
			try {
				this.sendToClient(clientId, event, data);
			} catch (error) {
				console.error(`[EventBroadcaster] Failed to send to client ${clientId}:`, error);
				// Continue with other clients (anti-fragile)
			}
		}
	}

	/**
	 * Send event to specific client
	 * Automatically detects which transport the client is using
	 *
	 * @param clientId - Client ID to send to
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * broadcaster.sendToClient(clientId, 'b2f:task:assigned', {
	 *   taskId: '123',
	 *   workerId: 'worker-1',
	 *   assignedAt: Date.now(),
	 * });
	 * ```
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
		// Try each transport until one successfully sends
		for (const transport of this.transportServers) {
			try {
				transport.sendToClient(clientId, event, data);
				// If successful, no need to try other transports
				return;
			} catch (error) {
				// Client not on this transport, try next
				continue;
			}
		}

		// If no transport found, queue for later delivery
		if (this.messageQueue) {
			console.warn(`[EventBroadcaster] Client ${clientId} not found, queuing event ${event}`);
			this.messageQueue.enqueue(clientId, {
				id: `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
				type: event,
				data,
				timestamp: Date.now(),
			});
		}
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

		// Send to each session's client
		sessions.forEach(session => {
			this.sendToClient(session.clientId, event, data);
		});
	}

	/**
	 * Get number of connected clients across ALL transports
	 *
	 * @returns Number of connected clients
	 */
	getConnectedClientsCount(): number {
		const allClients = new Set<string>();
		for (const transport of this.transportServers) {
			transport.getConnectedClients().forEach(clientId => allClients.add(clientId));
		}
		return allClients.size;
	}

	/**
	 * Get all connected client IDs across ALL transports
	 *
	 * @returns Array of unique client IDs
	 */
	getConnectedClients(): string[] {
		const allClients = new Set<string>();
		for (const transport of this.transportServers) {
			transport.getConnectedClients().forEach(clientId => allClients.add(clientId));
		}
		return Array.from(allClients);
	}

	/**
	 * Get transport distribution statistics
	 *
	 * @returns Statistics about client connections by transport type
	 */
	getTransportStats() {
		return this.sessionManager.getTransportStats();
	}
}
