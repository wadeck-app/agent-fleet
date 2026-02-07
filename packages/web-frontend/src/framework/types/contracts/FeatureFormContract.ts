/**
 * ===========================================================================================
 * FEATURE FORM CONTRACT
 * ===========================================================================================
 *
 * Contract for form-specific feature hooks (non-queryable features).
 * These hooks manage local form state only and do NOT contribute to backend queries.
 *
 * Key differences from FeatureContract:
 * - No fillQuery (form state is local, not sent to backend)
 * - Simplified contract focused on state and actions only
 * - Used by hooks like useListItems, useFormValidation, etc.
 *
 * Example usage:
 * ```typescript
 * function useListItems<T>(options): FeatureFormContract<ListItemsState<T>> {
 *   const [items, setItems] = useState<T[]>(options.initialItems || []);
 *
 *   const fstate = useMemo(() => ({
 *     items,
 *     count: items.length,
 *     canAdd: items.length < options.maxItems,
 *   }), [items, options.maxItems]);
 *
 *   const actions = useMemo(() => ({
 *     add: (item: T) => setItems(prev => [...prev, item]),
 *     remove: (index: number) => setItems(prev => prev.filter((_, i) => i !== index)),
 *   }), []);
 *
 *   return { fstate, actions };
 * }
 * ```
 *
 * ===========================================================================================
 */

/**
 * Contract for form-specific feature hooks.
 * These hooks manage local form state and DO NOT contribute to backend queries.
 *
 * @template TState - The shape of the feature's UI state
 */
export interface FeatureFormContract<TState> {
	/**
	 * Frozen state reference (memoized, stable).
	 * This is the single source of truth for the feature's current state.
	 *
	 * CRITICAL: fstate MUST be memoized (useMemo) and ONLY change when actual state values change.
	 * Use fstate everywhere: rendering, useEffect deps, and state access.
	 *
	 * Example:
	 * ```typescript
	 * const fstate = useMemo(() => ({ items, count, canAdd }), [items, count, canAdd]);
	 * ```
	 */
	fstate: TState;

	/**
	 * Actions to modify state.
	 * All state-changing functions should be grouped here.
	 *
	 * IMPORTANT: Actions should be memoized (useCallback or useMemo) for stable refs.
	 *
	 * Example:
	 * ```typescript
	 * const actions = useMemo(() => ({
	 *   add: (item: T) => setItems(prev => [...prev, item]),
	 *   remove: (index: number) => setItems(prev => prev.filter((_, i) => i !== index)),
	 * }), []);
	 * ```
	 */
	actions: Record<string, (...args: any[]) => void>;
}

/**
 * Type helper for extracting state type from a FeatureFormContract
 */
export type FeatureFormState<T> = T extends FeatureFormContract<infer S> ? S : never;
