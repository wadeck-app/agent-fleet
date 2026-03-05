import { createPageEventContext } from './PageEventContext';

/**
 * ===========================================================================================
 * GLOBAL EVENT CONTEXT - Singleton Event Context for Widget-Isolated Approach
 * ===========================================================================================
 *
 * Provides a singleton event context that can be used across all widgets.
 * This is necessary because widgets need to share the same context instance.
 *
 * Usage in page:
 * ```tsx
 * <GlobalPageEventProvider>
 *   <WidgetA />
 *   <WidgetB />
 * </GlobalPageEventProvider>
 * ```
 *
 * Usage in widgets:
 * ```tsx
 * const eventBus = useGlobalPageEventsOptional();
 * if (eventBus) {
 *   eventBus.emit('event:name', payload);
 * }
 * ```
 *
 * ===========================================================================================
 */

const { PageEventProvider, usePageEventsOptional } = createPageEventContext<Record<string, unknown>>();

export const GlobalPageEventProvider = PageEventProvider;
export const useGlobalPageEventsOptional = usePageEventsOptional;
