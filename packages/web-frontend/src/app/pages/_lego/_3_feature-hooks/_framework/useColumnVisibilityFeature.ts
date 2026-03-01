/**
 * ===========================================================================================
 * USE COLUMN VISIBILITY FEATURE - Column Visibility Feature Hook
 * ===========================================================================================
 *
 * React hook that provides column visibility feature flag for data tables.
 * The widget manages which columns are visible using this as a flag.
 *
 * Usage:
 * ```tsx
 * const columnVisibility = useColumnVisibilityFeature();
 * <HookDataTable features={[columnVisibility, ...]} />
 * ```
 *
 * ===========================================================================================
 */

export interface ColumnVisibilityFeatureHook {
	type: 'column-visibility';
}

export function useColumnVisibilityFeature(): ColumnVisibilityFeatureHook {
	return {
		type: 'column-visibility',
	};
}
