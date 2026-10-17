import type { EventHandler, EventType } from '@shared/transport';

/**
 * Event handler stored in a per-event-name registry.
 *
 * Registries (e.g. `Map<string, Set<ErasedEventHandler>>`) hold handlers for many different event types,
 * so the payload type is not known statically. Payloads arrive from the network and are not validated here,
 * hence `unknown`.
 */
export type ErasedEventHandler = (data: unknown) => void;

/**
 * Erase the event type of a typed handler so it can be stored in a heterogeneous registry.
 *
 * Returns the very same function reference (needed for `Set.delete(handler)` on unsubscribe).
 * This is the single place where the typed-subscription / untyped-dispatch boundary is crossed:
 * `subscribe<E>()` guarantees the handler matches the event name it is registered under.
 */
export function eraseEventHandler<E extends EventType>(handler: EventHandler<E>): ErasedEventHandler {
	// violations-suppress: ts/no-unsafe-type-cast single typed-subscribe to untyped-dispatch boundary; registry key (event name) guarantees the payload type
	return handler as ErasedEventHandler;
}
