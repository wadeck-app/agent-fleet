import EventEmitter from 'node:events';
import { createLogger } from 'shared-common/logger';

const log = createLogger('EventBus');

/**
 * Payload for ticket status change event
 */
export interface TicketStatusChangedPayload {
	ticketId: string;
	projectId: string;
	oldStatus: string;
	newStatus: string;
}

/**
 * All internal server-side event payloads
 * Keys follow the pattern `domain.action`
 */
export interface InternalEventMap {
	'ticket.status.changed': TicketStatusChangedPayload;
}

export type InternalEventName = keyof InternalEventMap;

type EventListener<T extends InternalEventName> = (payload: InternalEventMap[T]) => void | Promise<void>;

/**
 * ===========================================================================================
 * EVENT BUS
 * ===========================================================================================
 *
 * In-process typed event bus for server-side domain events.
 * Used to decouple services (e.g. TicketsService → integration worker dispatch).
 *
 * Unlike EventBroadcaster (which sends events to connected frontend clients),
 * EventBus handles internal backend-to-backend routing.
 *
 * Usage:
 * ```typescript
 * // Emitting (e.g., TicketsService)
 * eventBus.emit('ticket.status.changed', { ticketId, projectId, oldStatus, newStatus });
 *
 * // Subscribing (e.g., EventSubscriptionRegistry)
 * eventBus.on('ticket.status.changed', async (payload) => { ... });
 * ```
 * ===========================================================================================
 */
export class EventBus {
	private readonly emitter = new EventEmitter();

	constructor() {
		// Increase listener limit to support multiple subscribers per event
		this.emitter.setMaxListeners(50);
	}

	/**
	 * Emit a typed event to all registered listeners
	 */
	emit<T extends InternalEventName>(event: T, payload: InternalEventMap[T]): void {
		log.debug(`Emitting internal event: ${event}`);
		this.emitter.emit(event, payload);
	}

	/**
	 * Subscribe to a typed event
	 * @returns Unsubscribe function
	 */
	on<T extends InternalEventName>(event: T, listener: EventListener<T>): () => void {
		const wrappedListener = async (payload: InternalEventMap[T]) => {
			try {
				await listener(payload);
			} catch (error) {
				log.error(`Error in EventBus listener for '${event}':`, error);
			}
		};
		this.emitter.on(event, wrappedListener);
		return () => this.emitter.off(event, wrappedListener);
	}

	/**
	 * Subscribe to a typed event for a single invocation
	 */
	once<T extends InternalEventName>(event: T, listener: EventListener<T>): void {
		this.emitter.once(event, listener);
	}

	/**
	 * Remove all listeners (useful for testing cleanup)
	 */
	removeAllListeners(): void {
		this.emitter.removeAllListeners();
	}
}
