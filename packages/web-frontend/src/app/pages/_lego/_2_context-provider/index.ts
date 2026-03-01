/**
 * ===========================================================================================
 * LEGO APPROACH 2: CONTEXT-PROVIDER
 * ===========================================================================================
 *
 * Barrel export for all scenario pages and framework components.
 *
 * Key Principle: A Provider (Context) owns all state. View components read from Context —
 * they have no data props, no service, no fetch logic. Cross-widget communication is
 * implicit through shared Context.
 *
 * ===========================================================================================
 */

// Framework exports
export { createDomainContext } from './_framework';
export type { DomainContextValue } from './_framework';
export { ProductProvider, useProductDomain } from './_framework';
export type { ProductQuery, ProductActions, ProductProviderProps } from './_framework';
export { PageLayout } from './_framework';
export { SplitLayout } from './_framework';
export { ViewDataTable } from './_framework';
export type { ViewDataTableProps } from './_framework';
export { SelectableViewDataTable } from './_framework';
export type { SelectableViewDataTableProps } from './_framework';
export { ViewItemGrid } from './_framework';
export type { ViewItemGridProps } from './_framework';
export { ViewCarousel } from './_framework';
export type { ViewCarouselProps } from './_framework';
export { ViewDetailPanel } from './_framework';
export type { ViewDetailPanelProps } from './_framework';
export { ProductDialogAdapter } from './_framework';

// Scenario pages
export { S1Page } from './S1_SimpleTable/S1Page';
export { S2Page } from './S2_TablePagination/S2Page';
export { S3Page } from './S3_FullFeatured/S3Page';
export { S4Page } from './S4_GridPopup/S4Page';
export { S5Page } from './S5_Carousel/S5Page';
export { S6Page } from './S6_ItemDetail/S6Page';
