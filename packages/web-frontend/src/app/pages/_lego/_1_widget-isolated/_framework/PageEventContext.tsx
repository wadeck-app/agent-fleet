import React, { type ReactNode, createContext, useContext, useMemo } from 'react';

import { type EventBus, createEventBus } from './EventBus';

/**
 * ===========================================================================================
 * PAGE EVENT CONTEXT - React Context for Event Bus
 * ===========================================================================================
 *
 * Provides a type-safe event bus to all widgets on a page via React Context.
 * Each page creates its own event bus instance with its own event schema.
 *
 * Features:
 * - Type-safe event names and payloads per page
 * - Context-based distribution to child widgets
 * - Factory function for creating page-specific contexts
 * - Automatic bus creation on mount
 *
 * Usage:
 * ```tsx
 * type ProductPageEvents = {
 *   'product:selected': { id: string };
 *   'product:updated': { product: Product };
 * };
 *
 * const { PageEventProvider, usePageEvents } = createPageEventContext<ProductPageEvents>();
 *
 * function MyPage() {
 *   return (
 *     <PageEventProvider>
 *       <WidgetA />
 *       <WidgetB />
 *     </PageEventProvider>
 *   );
 * }
 *
 * function WidgetA() {
 *   const bus = usePageEvents();
 *   bus.emit('product:selected', { id: '123' });
 * }
 * ```
 *
 * ===========================================================================================
 */

/**
 * Factory function to create a page-specific event context
 * Returns provider and hook for accessing the event bus
 */
export function createPageEventContext<TEvents extends Record<string, unknown>>() {
	const EventContext = createContext<EventBus<TEvents> | null>(null);

	function PageEventProvider({ children }: { children: ReactNode }) {
		const bus = useMemo(() => createEventBus<TEvents>(), []);

		return <EventContext.Provider value={bus}>{children}</EventContext.Provider>;
	}

	function usePageEvents(): EventBus<TEvents> {
		const bus = useContext(EventContext);
		if (!bus) {
			throw new Error('usePageEvents must be used within PageEventProvider');
		}
		return bus;
	}

	return {
		PageEventProvider,
		usePageEvents,
	};
}

/**
 * PageLayout component - Simple wrapper that provides event bus context
 * Creates event bus only once per mount
 */
export function PageLayout<TEvents extends Record<string, unknown>>({
	children,
}: {
	children: ReactNode;
}): React.ReactElement {
	const bus = useMemo(() => createEventBus<TEvents>(), []);
	const EventContext = useMemo(() => createContext<EventBus<TEvents> | null>(null), []);

	return <EventContext.Provider value={bus}>{children}</EventContext.Provider>;
}
