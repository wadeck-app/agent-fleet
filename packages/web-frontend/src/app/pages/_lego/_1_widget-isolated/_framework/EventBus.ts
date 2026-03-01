/**
 * ===========================================================================================
 * EVENT BUS - Pure TypeScript Event System
 * ===========================================================================================
 *
 * Type-safe event bus for cross-widget communication.
 * Pure TypeScript implementation with no external dependencies.
 *
 * Features:
 * - Type-safe event names and payloads
 * - Subscribe/unsubscribe pattern
 * - Returns cleanup function from `on()`
 * - No React dependencies
 *
 * Usage:
 * ```ts
 * type AppEvents = {
 *   'product:selected': { id: string };
 *   'product:updated': { product: Product };
 * };
 *
 * const bus = createEventBus<AppEvents>();
 * const unsubscribe = bus.on('product:selected', ({ id }) => console.log(id));
 * bus.emit('product:selected', { id: '123' });
 * unsubscribe();
 * ```
 *
 * ===========================================================================================
 */

export interface EventBus<TEvents extends Record<string, unknown>> {
	/**
	 * Emit an event with its payload
	 */
	emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;

	/**
	 * Subscribe to an event
	 * Returns cleanup function to unsubscribe
	 */
	on<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): () => void;

	/**
	 * Unsubscribe from an event
	 */
	off<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): void;
}

/**
 * Create a new event bus instance
 */
export function createEventBus<TEvents extends Record<string, unknown>>(): EventBus<TEvents> {
	const handlers = new Map<keyof TEvents, Set<(payload: unknown) => void>>();

	return {
		emit(event, payload) {
			const eventHandlers = handlers.get(event);
			if (!eventHandlers) return;

			eventHandlers.forEach(handler => {
				try {
					handler(payload);
				} catch (error) {
					console.error(`Error in event handler for "${String(event)}":`, error);
				}
			});
		},

		on(event, handler) {
			if (!handlers.has(event)) {
				handlers.set(event, new Set());
			}
			const eventHandlers = handlers.get(event);
			if (eventHandlers) {
				eventHandlers.add(handler as (payload: unknown) => void);
			}

			return () => this.off(event, handler);
		},

		off(event, handler) {
			const eventHandlers = handlers.get(event);
			if (!eventHandlers) return;

			eventHandlers.delete(handler as (payload: unknown) => void);

			if (eventHandlers.size === 0) {
				handlers.delete(event);
			}
		},
	};
}
