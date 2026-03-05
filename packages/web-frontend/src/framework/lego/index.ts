/**
 * ===========================================================================================
 * LEGO FRAMEWORK - Barrel Export
 * ===========================================================================================
 *
 * Central export point for the Lego framework foundation.
 *
 * Exports:
 * - Column types and builder (ColTypes, col)
 * - Feature types and helpers (FeatureTypes)
 * - Query pipeline types (QueryModifier, BaseQuery)
 *
 * ===========================================================================================
 */

// Column types and builder
export type { ColumnDef } from './types/ColTypes';
export { col } from './helpers/col';

// Helpers
export { renderColumnValue } from './helpers/renderColumnValue';

// Feature types
export type {
	SearchConfig,
	PaginationConfig,
	SortingConfig,
	CrudConfig,
	CrudDialogProps,
	BulkDeleteConfig,
	AutoplayConfig,
	FieldVisibilityConfig,
	InlineEditConfig,
	ColumnVisibilityConfig,
	ColumnReorderingConfig,
	DataTableFeature,
	CarouselFeature,
	ItemGridFeature,
	DetailPanelFeature,
} from './types/FeatureTypes';
export { resolveFeature } from './types/FeatureTypes';

// Query pipeline types (for A5 approach)
export type { BaseQuery, QueryModifier } from './types/PipelineTypes';
export {
	withSearch,
	withPagination,
	withSort,
	withFeature,
	withoutField,
	composeModifiers,
} from './types/PipelineTypes';
