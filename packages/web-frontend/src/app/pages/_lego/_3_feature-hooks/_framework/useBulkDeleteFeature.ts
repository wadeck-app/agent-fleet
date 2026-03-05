/**
 * ===========================================================================================
 * USE BULK DELETE FEATURE - Bulk Delete Feature Hook
 * ===========================================================================================
 *
 * React hook that provides bulk delete feature flag for data tables.
 * The widget manages selection and deletion using this as a flag.
 *
 * Usage:
 * ```tsx
 * const bulkDelete = useBulkDeleteFeature();
 * <HookDataTable features={[bulkDelete, ...]} />
 * ```
 *
 * ===========================================================================================
 */

export interface BulkDeleteFeatureHook {
	type: 'bulk-delete';
}

export function useBulkDeleteFeature(): BulkDeleteFeatureHook {
	return {
		type: 'bulk-delete',
	};
}
