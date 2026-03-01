/**
 * ===========================================================================================
 * APPROACH 3: FEATURE HOOKS FRAMEWORK
 * ===========================================================================================
 *
 * Barrel export for the feature hooks approach.
 *
 * Architecture:
 * - Page creates feature hooks (typed instances)
 * - Widget accepts hooks as props and uses their state
 * - No context, no event bus — just direct prop passing
 *
 * ===========================================================================================
 */

// Feature Hooks
export { useSearchFeature } from './useSearchFeature';
export type { SearchFeatureHook, UseSearchFeatureConfig } from './useSearchFeature';

export { usePaginationFeature } from './usePaginationFeature';
export type { PaginationFeatureHook, UsePaginationFeatureConfig } from './usePaginationFeature';

export { useSortingFeature } from './useSortingFeature';
export type { SortingFeatureHook } from './useSortingFeature';

export { useColumnVisibilityFeature } from './useColumnVisibilityFeature';
export type { ColumnVisibilityFeatureHook } from './useColumnVisibilityFeature';

export { useBulkDeleteFeature } from './useBulkDeleteFeature';
export type { BulkDeleteFeatureHook } from './useBulkDeleteFeature';

export { useCrudFeature } from './useCrudFeature';
export type { CrudFeatureHook } from './useCrudFeature';

// Widgets
export { HookDataTable } from './HookDataTable';
export type { HookDataTableProps, DataTableFeatureHook } from './HookDataTable';

export { HookItemGrid } from './HookItemGrid';
export type { HookItemGridProps, ItemGridFeatureHook } from './HookItemGrid';

export { HookCarousel } from './HookCarousel';
export type { HookCarouselProps, CarouselFeatureHook } from './HookCarousel';

export { HookDetailPanel } from './HookDetailPanel';
export type { HookDetailPanelProps } from './HookDetailPanel';

// Layouts
export { PageLayout } from './PageLayout';
export type { PageLayoutProps } from './PageLayout';

export { SplitLayout } from './SplitLayout';
export type { SplitLayoutProps } from './SplitLayout';
