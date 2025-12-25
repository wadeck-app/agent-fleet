/**
 * Message Queue for Polling Clients
 *
 * Stores events for clients that use polling-based transports (SSE, Long Polling)
 * instead of bidirectional WebSocket.
 *
 * Features:
 * - Per-client message queues with TTL
 * - Automatic cleanup of expired messages
 * - Memory-safe with max queue size per client
 * - Thread-safe operations
 *
 * Anti-fragility:
 * - No global state shared between clients
 * - Automatic garbage collection prevents memory leaks
 * - Graceful degradation if queue is full (oldest messages dropped)
 * - No single point of failure
 */
import type { TransportEvent } from '@app/shared/transport';

/**
 * Queued Message
 * Wraps a TransportEvent with metadata for queue management
 */
interface QueuedMessage {
	/** The event to deliver */
	event: TransportEvent;
	/** When this message was queued (for TTL) */
	queuedAt: number;
	/** Message ID for deduplication */
	messageId: string;
}

/**
 * Message Queue Configuration
 */
export interface MessageQueueConfig {
	/** Maximum messages per client queue (default: 100) */
	maxQueueSize?: number;
	/** Message TTL in milliseconds (default: 60000 = 1 minute) */
	messageTTL?: number;
	/** Cleanup interval in milliseconds (default: 10000 = 10 seconds) */
	cleanupInterval?: number;
}

/**
 * Message Queue for Polling Clients
 *
 * Manages per-client message queues for transports that cannot receive
 * real-time push events (SSE, Long Polling).
 *
 * @example
 * ```typescript
 * const queue = new MessageQueue({ maxQueueSize: 100, messageTTL: 60000 });
 *
 * // Enqueue event for client
 * queue.enqueue('client-123', {
 *   id: 'evt-1',
 *   type: 'b2f:task:created',
 *   data: { taskId: '456' },
 *   timestamp: Date.now()
 * });
 *
 * // Get pending events for client
 * const events = queue.dequeue('client-123');
 *
 * // Cleanup
 * queue.shutdown();
 * ```
 */
export class MessageQueue {
	/**
	 * Per-client message queues
	 * Map<clientId, QueuedMessage[]>
	 */
	private queues = new Map<string, QueuedMessage[]>();

	/**
	 * Configuration
	 */
	private config: Required<MessageQueueConfig>;

	/**
	 * Cleanup interval timer
	 */
	private cleanupTimer: NodeJS.Timeout | null = null;

	/**
	 * Delivered message IDs per client (for deduplication)
	 * Map<clientId, Set<messageId>>
	 */
	private deliveredMessages = new Map<string, Set<string>>();

	/**
	 * Create a new MessageQueue
	 */
	constructor(config: MessageQueueConfig = {}) {
		this.config = {
			maxQueueSize: config.maxQueueSize ?? 100,
			messageTTL: config.messageTTL ?? 60000, // 1 minute
			cleanupInterval: config.cleanupInterval ?? 10000, // 10 seconds
		};

		// Start automatic cleanup
		this.startCleanup();
	}

	/**
	 * Enqueue an event for a client
	 *
	 * @param clientId - Client identifier
	 * @param event - Event to enqueue
	 * @returns True if enqueued, false if queue is full (oldest dropped)
	 */
	enqueue(clientId: string, event: TransportEvent): boolean {
		// Get or create queue for client
		let queue = this.queues.get(clientId);
		if (!queue) {
			queue = [];
			this.queues.set(clientId, queue);
		}

		// Check for duplicate (already delivered)
		const delivered = this.deliveredMessages.get(clientId);
		if (delivered?.has(event.id)) {
			console.log(`[MessageQueue] Skipping duplicate event ${event.id} for client ${clientId}`);
			return false;
		}

		// Create queued message
		const queuedMessage: QueuedMessage = {
			event,
			queuedAt: Date.now(),
			messageId: event.id,
		};

		// Add to queue
		queue.push(queuedMessage);

		// Enforce max queue size (drop oldest if exceeded)
		if (queue.length > this.config.maxQueueSize) {
			const dropped = queue.shift();
			console.warn(
				`[MessageQueue] Queue full for client ${clientId}, dropped oldest message: ${dropped?.event.id}`
			);
			return false;
		}

		console.log(`[MessageQueue] Enqueued event ${event.type} (${event.id}) for client ${clientId}`);
		return true;
	}

	/**
	 * Dequeue all pending events for a client
	 *
	 * Returns all events in the queue and marks them as delivered.
	 * The queue is cleared after dequeue.
	 *
	 * @param clientId - Client identifier
	 * @returns Array of events (empty if no pending events)
	 */
	dequeue(clientId: string): TransportEvent[] {
		const queue = this.queues.get(clientId);
		if (!queue || queue.length === 0) {
			return [];
		}

		// Get all events
		const events = queue.map(qm => qm.event);

		// Mark as delivered
		let delivered = this.deliveredMessages.get(clientId);
		if (!delivered) {
			delivered = new Set();
			this.deliveredMessages.set(clientId, delivered);
		}

		queue.forEach(qm => {
			delivered!.add(qm.messageId);
		});

		// Clear queue
		this.queues.set(clientId, []);

		console.log(`[MessageQueue] Dequeued ${events.length} events for client ${clientId}`);
		return events;
	}

	/**
	 * Peek at pending events without removing them
	 *
	 * @param clientId - Client identifier
	 * @returns Array of events (empty if no pending events)
	 */
	peek(clientId: string): TransportEvent[] {
		const queue = this.queues.get(clientId);
		if (!queue) {
			return [];
		}

		return queue.map(qm => qm.event);
	}

	/**
	 * Get queue size for a client
	 *
	 * @param clientId - Client identifier
	 * @returns Number of pending events
	 */
	getQueueSize(clientId: string): number {
		const queue = this.queues.get(clientId);
		return queue?.length ?? 0;
	}

	/**
	 * Clear queue for a client
	 *
	 * @param clientId - Client identifier
	 */
	clearQueue(clientId: string): void {
		this.queues.delete(clientId);
		this.deliveredMessages.delete(clientId);
		console.log(`[MessageQueue] Cleared queue for client ${clientId}`);
	}

	/**
	 * Get all client IDs with pending messages
	 *
	 * @returns Array of client IDs
	 */
	getClientsWithPendingMessages(): string[] {
		const clients: string[] = [];
		for (const [clientId, queue] of this.queues) {
			if (queue.length > 0) {
				clients.push(clientId);
			}
		}
		return clients;
	}

	/**
	 * Get total number of queued messages across all clients
	 *
	 * @returns Total message count
	 */
	getTotalQueuedMessages(): number {
		let total = 0;
		for (const queue of this.queues.values()) {
			total += queue.length;
		}
		return total;
	}

	/**
	 * Start automatic cleanup of expired messages
	 */
	private startCleanup(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanupExpiredMessages();
		}, this.config.cleanupInterval);
	}

	/**
	 * Cleanup expired messages and empty queues
	 *
	 * Removes:
	 * - Messages older than TTL
	 * - Empty queues
	 * - Old delivered message IDs
	 */
	private cleanupExpiredMessages(): void {
		const now = Date.now();
		let expiredCount = 0;
		let emptyQueuesRemoved = 0;

		// Cleanup expired messages
		for (const [clientId, queue] of this.queues) {
			const originalLength = queue.length;

			// Filter out expired messages
			const filtered = queue.filter(qm => {
				const age = now - qm.queuedAt;
				if (age > this.config.messageTTL) {
					console.log(`[MessageQueue] Expired message ${qm.event.id} for client ${clientId} (age: ${age}ms)`);
					expiredCount++;
					return false;
				}
				return true;
			});

			// Update or remove queue
			if (filtered.length === 0) {
				this.queues.delete(clientId);
				emptyQueuesRemoved++;
			} else if (filtered.length !== originalLength) {
				this.queues.set(clientId, filtered);
			}
		}

		// Cleanup delivered messages older than 2x TTL
		for (const [clientId, delivered] of this.deliveredMessages) {
			if (delivered.size > 1000) {
				// Keep only last 500
				const keep = Array.from(delivered).slice(-500);
				this.deliveredMessages.set(clientId, new Set(keep));
			}
		}

		if (expiredCount > 0 || emptyQueuesRemoved > 0) {
			console.log(
				`[MessageQueue] Cleanup: expired=${expiredCount}, emptyQueues=${emptyQueuesRemoved}, ` +
					`totalQueued=${this.getTotalQueuedMessages()}`
			);
		}
	}

	/**
	 * Shutdown the message queue
	 *
	 * Stops cleanup timer and clears all queues.
	 * Call this during graceful shutdown.
	 */
	shutdown(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}

		this.queues.clear();
		this.deliveredMessages.clear();

		console.log('[MessageQueue] Shutdown complete');
	}

	/**
	 * Get statistics about the message queue
	 *
	 * @returns Queue statistics
	 */
	getStats(): {
		totalClients: number;
		clientsWithPending: number;
		totalQueuedMessages: number;
		averageQueueSize: number;
		maxQueueSize: number;
	} {
		const clientsWithPending = this.getClientsWithPendingMessages();
		const totalQueued = this.getTotalQueuedMessages();

		let maxSize = 0;
		for (const queue of this.queues.values()) {
			if (queue.length > maxSize) {
				maxSize = queue.length;
			}
		}

		return {
			totalClients: this.queues.size,
			clientsWithPending: clientsWithPending.length,
			totalQueuedMessages: totalQueued,
			averageQueueSize: clientsWithPending.length > 0 ? totalQueued / clientsWithPending.length : 0,
			maxQueueSize: maxSize,
		};
	}
}
