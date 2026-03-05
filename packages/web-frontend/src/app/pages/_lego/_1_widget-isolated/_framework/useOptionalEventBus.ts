import type { EventBus } from './EventBus';
import { createPageEventContext } from './PageEventContext';

/**
 * ===========================================================================================
 * USE OPTIONAL EVENT BUS - Hook for Optional Event Bus Access
 * ===========================================================================================
 *
 * Provides optional access to the page event bus.
 * Returns null if no event bus is available.
 * Used by widgets that can work with or without event bus.
 *
 * Usage:
 * ```tsx
 * const eventBus = useOptionalEventBus<MyEvents>();
 * if (eventBus) {
 *   eventBus.emit('event:name', payload);
 * }
 * ```
 *
 * ===========================================================================================
 */

const { usePageEventsOptional } = createPageEventContext<Record<string, unknown>>();

export function useOptionalEventBus<TEvents extends Record<string, unknown>>(): EventBus<TEvents> | null {
	return usePageEventsOptional() as EventBus<TEvents> | null;
}
