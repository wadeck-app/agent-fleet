/**
 * ===========================================================================================
 * LEGO FRAMEWORK - Widget-Isolated Approach (Approach 1)
 * ===========================================================================================
 *
 * Central export for the widget-isolated Lego framework.
 * Each widget owns its own query state internally.
 * Cross-widget communication via typed event bus.
 *
 * Exports:
 * - Event bus (EventBus, createEventBus)
 * - Page event context (createPageEventContext, PageLayout)
 * - Layouts (SplitLayout)
 * - Hooks (useWidgetQuery, useWidgetDataFetch)
 * - Widgets (WidgetDataTable, WidgetItemGrid, WidgetCarousel, WidgetDetailPanel)
 *
 * ===========================================================================================
 */

export { type EventBus, createEventBus } from './EventBus';
export { createPageEventContext, PageLayout } from './PageEventContext';
export { SplitLayout } from './SplitLayout';
export { useWidgetQuery, type UseWidgetQueryResult, type WidgetQueryState } from './useWidgetQuery';
export { useWidgetDataFetch, type UseWidgetDataFetchResult, type PaginationData } from './useWidgetDataFetch';
export { WidgetDataTable, type WidgetDataTableProps } from './WidgetDataTable';
export { WidgetItemGrid, type WidgetItemGridProps } from './WidgetItemGrid';
export { WidgetCarousel, type WidgetCarouselProps } from './WidgetCarousel';
export { WidgetDetailPanel, type WidgetDetailPanelProps } from './WidgetDetailPanel';
