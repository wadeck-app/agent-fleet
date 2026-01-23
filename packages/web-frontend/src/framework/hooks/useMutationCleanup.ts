import { useEffect } from 'react';

/**
 * ===========================================================================================
 * USE MUTATION CLEANUP - Automatic Cleanup After Data Mutations
 * ===========================================================================================
 *
 * Eliminates duplicated useEffect cleanup logic repeated across 6+ CRUD pages.
 * Automatically clears mutation state when data refresh completes.
 *
 * **Before (repeated in every CRUD page):**
 * ```typescript
 * const isMutating = useRef(false);
 *
 * useEffect(() => {
 *   if (isMutating.current && data.length > 0) {
 *     isMutating.current = false;
 *     setIsRefreshingAfterMutation(false);
 *     setIsBulkDeleting(false);
 *     setDeletingIds(new Set());
 *   }
 * }, [data]);
 * ```
 *
 * **After (one hook call):**
 * ```typescript
 * useMutationCleanup({
 *   data: projects,
 *   isMutating: bulkDelete.state.isMutating,
 *   onCleanup: () => bulkDelete.actions.clear()
 * });
 * ```
 *
 * **How It Works:**
 * 1. When `isMutating` is true, hook waits for data to change
 * 2. When data changes (length > 0), triggers cleanup callback
 * 3. Cleanup callback typically clears mutation state flags
 *
 * **Use Cases:**
 * - Clear strike-through effect after delete completes
 * - Remove blur effect after bulk operation finishes
 * - Reset "refreshing after mutation" flags
 *
 * ===========================================================================================
 */

export interface UseMutationCleanupOptions<TData> {
	/**
	 * The data array to watch for changes.
	 * When this changes after a mutation, cleanup is triggered.
	 */
	data: TData[];

	/**
	 * Whether a mutation is currently in progress.
	 * When true, hook watches for data changes to trigger cleanup.
	 */
	isMutating: boolean;

	/**
	 * Callback invoked when cleanup should occur.
	 * Typically clears mutation state flags (deletingIds, isBulkDeleting, etc.)
	 */
	onCleanup: () => void;
}

/**
 * Hook to automatically clean up mutation state when data refresh completes.
 * Eliminates ~10 lines of boilerplate useEffect per CRUD page.
 *
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * const bulkDelete = useBulkDeleteState();
 *
 * useMutationCleanup({
 *   data: items,
 *   isMutating: bulkDelete.state.isMutating,
 *   onCleanup: () => bulkDelete.actions.clear()
 * });
 * ```
 */
export function useMutationCleanup<TData>({ data, isMutating, onCleanup }: UseMutationCleanupOptions<TData>): void {
	useEffect(() => {
		// Only trigger cleanup if:
		// 1. A mutation is in progress (isMutating === true)
		// 2. Data has refreshed (data exists and has length > 0)
		if (isMutating && data && data.length > 0) {
			onCleanup();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.length, isMutating]);
}
