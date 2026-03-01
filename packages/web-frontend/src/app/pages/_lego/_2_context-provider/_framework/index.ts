/**
 * ===========================================================================================
 * LEGO FRAMEWORK - APPROACH 2: CONTEXT-PROVIDER
 * ===========================================================================================
 *
 * Barrel export for all framework components and utilities.
 *
 * ===========================================================================================
 */

export { createDomainContext } from './DomainContext';
export type { DomainContextValue } from './DomainContext';

export { ProductProvider, useProductDomain } from './ProductDomainContext';
export type { ProductQuery, ProductActions, ProductProviderProps } from './ProductDomainContext';

export { PageLayout } from './PageLayout';
export { SplitLayout } from './SplitLayout';

export { ViewDataTable } from './ViewDataTable';
export type { ViewDataTableProps } from './ViewDataTable';

export { SelectableViewDataTable } from './SelectableViewDataTable';
export type { SelectableViewDataTableProps } from './SelectableViewDataTable';

export { ViewItemGrid } from './ViewItemGrid';
export type { ViewItemGridProps } from './ViewItemGrid';

export { ViewCarousel } from './ViewCarousel';
export type { ViewCarouselProps } from './ViewCarousel';

export { ViewDetailPanel } from './ViewDetailPanel';
export type { ViewDetailPanelProps } from './ViewDetailPanel';

export { ProductDialogAdapter } from './ProductDialogAdapter';
