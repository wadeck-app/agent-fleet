import type { EventData, EventType } from '@app/shared';

import type { ITransportServer } from './ITransportServer';
import type { WebSocketSessionManager } from './WebSocketSessionManager';

/**
 * ===========================================================================================
 * EVENT BROADCASTER - CENTRAL EVENT BROADCASTING SERVICE
 * ===========================================================================================
 *
 * Wrapper around ITransportServer for type-safe event emission.
 * Provides convenience methods for broadcasting events to clients.
 *
 * Features:
 * - Type-safe event emission using EventTypes
 * - Broadcast to all connected clients
 * - Send to specific client
 * - Send to all sessions of a specific user (multi-device support)
 * - Automatic subscription filtering via WebSocketSessionManager
 *
 * Architecture:
 * Service → EventBroadcaster → ITransportServer → WebSocket clients
 *
 * @example
 * ```typescript
 * // In a service
 * async createTask(data: CreateTaskDto): Promise<Task> {
 *   const task = await this.repository.createTask(data);
 *
 *   // Broadcast to all subscribed clients
 *   this.eventBroadcaster.broadcast('task:created', task);
 *
 *   return task;
 * }
 * ```
 *
 * ===========================================================================================
 */
export class EventBroadcaster {
	constructor(
		private transportServer: ITransportServer,
		private sessionManager: WebSocketSessionManager
	) {}

	/**
	 * Broadcast event to all connected clients
	 * Server-side subscription filtering is applied automatically
	 *
	 * @param event - Event type (e.g., 'task:created', 'worker:heartbeat')
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * broadcaster.broadcast('task:created', {
	 *   id: '123',
	 *   name: 'New task',
	 *   status: 'pending',
	 *   // ... other task fields
	 * });
	 * ```
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		this.transportServer.broadcast(event, data);
	}

	/**
	 * Send event to specific client
	 * Checks subscription before sending
	 *
	 * @param clientId - Client ID to send to
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * broadcaster.sendToClient(clientId, 'task:assigned', {
	 *   taskId: '123',
	 *   workerId: 'worker-1',
	 *   assignedAt: Date.now(),
	 * });
	 * ```
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
		this.transportServer.sendToClient(clientId, event, data);
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
	 * Get number of connected clients
	 *
	 * @returns Number of connected clients
	 */
	getConnectedClientsCount(): number {
		return this.transportServer.getConnectedClients().length;
	}

	/**
	 * Get all connected client IDs
	 *
	 * @returns Array of client IDs
	 */
	getConnectedClients(): string[] {
		return this.transportServer.getConnectedClients();
	}
}
