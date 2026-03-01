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
 *
 * ===========================================================================================
 */

// Column types and builder
export type { ColumnDef } from './types/ColTypes';
export { col } from './helpers/col';

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
