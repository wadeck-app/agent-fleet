import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Global pending updates queue for batching URL changes
const pendingUpdates = new Map<string, string | null>();
let flushPending: (() => void) | null = null;

/**
 * ===========================================================================================
 * URL STATE MANAGEMENT HOOK
 * ===========================================================================================
 *
 * Generic hook for managing state synchronized with URL query parameters.
 * Supports namespacing, nested groups, custom serialization, debouncing, and URL cleanup.
 *
 * Features:
 * - Namespace format: {groupId}={value} or {groupId}.{key}={value}
 * - Nested groups with automatic child reset when parent changes
 * - Custom serialization/deserialization for complex types
 * - Automatic URL cleanup (removes params that equal defaultValue)
 * - Type-safe state management
 *
 * @example Simple usage
 * ```typescript
 * const [view, setView] = useUrlState({
 *   key: 'view',
 *   defaultValue: 'tasks',
 * });
 * ```
 *
 * @example With group namespace
 * ```typescript
 * const [projectId, setProjectId] = useUrlState({
 *   key: 'id',
 *   groupId: 'project',
 *   defaultValue: null,
 * });
 * // URL: ?project.id=p1
 * ```
 *
 * @example Nested groups
 * ```typescript
 * const [projectId, setProjectId] = useUrlState({
 *   key: 'id',
 *   groupId: 'project',
 *   defaultValue: null,
 * });
 *
 * const [workspaceId, setWorkspaceId] = useUrlState({
 *   key: 'id',
 *   groupId: 'workspace',
 *   parentGroupId: 'project',
 *   parentValue: projectId,
 *   defaultValue: null,
 * });
 * // URL: ?project.id=p1&workspace.id=w1
 * // When projectId changes, workspaceId is automatically reset
 * ```
 *
 * @example Custom serialization
 * ```typescript
 * const [filters, setFilters] = useUrlState({
 *   key: 'filters',
 *   defaultValue: { status: [], priority: [] },
 *   serialize: (value) => JSON.stringify(value),
 *   deserialize: (str) => JSON.parse(str),
 * });
 * ```
 *
 * ===========================================================================================
 */

export interface UseUrlStateOptions<T> {
	/**
	 * The URL parameter key (will be prefixed with groupId if provided)
	 */
	key: string;

	/**
	 * Optional group namespace (e.g., 'project', 'workspace')
	 * Creates parameters like: {groupId}.{key}={value}
	 */
	groupId?: string;

	/**
	 * Parent group ID for nested groups
	 * When parent value changes, this value will reset to defaultValue
	 */
	parentGroupId?: string;

	/**
	 * Current parent value (for nested groups)
	 * Used to detect parent changes and reset child values
	 */
	parentValue?: string | null;

	/**
	 * Default value when no URL parameter exists
	 */
	defaultValue: T;

	/**
	 * Custom serialization function
	 * Default: String(value)
	 */
	serialize?: (value: T) => string;

	/**
	 * Custom deserialization function
	 * Default: value as T
	 */
	deserialize?: (value: string) => T;

	/**
	 * Whether to clean up URL params that equal defaultValue
	 * Default: true
	 */
	cleanupDefault?: boolean;
}

/**
 * Generic hook for managing URL state with advanced features
 */
export function useUrlState<T>({
	key,
	groupId,
	parentGroupId,
	parentValue,
	defaultValue,
	serialize = (value: T) => String(value),
	deserialize = (value: string) => value as T,
	cleanupDefault = true,
}: UseUrlStateOptions<T>): [T, (value: T | ((prev: T) => T)) => void] {
	const [searchParams, setSearchParams] = useSearchParams();

	// Compute full parameter name
	const paramName = groupId ? `${groupId}.${key}` : key;

	// Track parent value to detect changes
	const prevParentValue = useRef(parentValue);

	// Track the last URL value we synced to detect external changes
	const lastSyncedUrlValue = useRef<string | null>(null);

	// Initialize state from URL or default
	const [state, setState] = useState<T>(() => {
		const urlValue = searchParams.get(paramName);
		lastSyncedUrlValue.current = urlValue;
		if (urlValue !== null) {
			try {
				return deserialize(urlValue);
			} catch (error) {
				console.error(`[useUrlState] Failed to deserialize URL param ${paramName}:`, error);
			}
		}
		return defaultValue;
	});

	// Reset state when parent value changes (nested groups)
	useEffect(() => {
		if (parentGroupId && parentValue !== prevParentValue.current) {
			prevParentValue.current = parentValue;
			setState(defaultValue);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [parentValue, parentGroupId]);

	// Sync URL with state
	useEffect(() => {
		// Check if value equals default and should be cleaned up
		const shouldCleanup = cleanupDefault && state === defaultValue;

		// Determine what the new URL value should be
		const newUrlValue = shouldCleanup ? null : serialize(state);

		// CRITICAL: Don't write if value hasn't changed
		// This prevents re-triggering flushes with stale values after Listen effects run
		if (lastSyncedUrlValue.current === newUrlValue) {
			return;
		}

		// Update lastSyncedUrlValue to match what we're about to write
		lastSyncedUrlValue.current = newUrlValue;

		// Add to pending updates queue
		pendingUpdates.set(paramName, newUrlValue);

		// Schedule flush if not already scheduled
		if (!flushPending) {
			flushPending = () => {
				console.log('[useUrlState] FLUSHING pending updates:', Array.from(pendingUpdates.entries()));

				// Use functional update to avoid stale closure bug
				// This ensures we read the LATEST searchParams, not one captured in closure
				setSearchParams(
					prev => {
						const newParams = new URLSearchParams(prev);

						// Apply all pending updates
						for (const [key, value] of pendingUpdates.entries()) {
							if (value === null) {
								newParams.delete(key);
							} else {
								newParams.set(key, value);
							}
						}

						console.log('[useUrlState] Calling setSearchParams with:', newParams.toString());
						return newParams;
					},
					{ replace: true }
				);

				// Clear queue
				pendingUpdates.clear();
				flushPending = null;
			};

			// Schedule flush in microtask to batch all synchronous updates
			queueMicrotask(flushPending);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps, no-restricted-syntax
	}, [state, paramName, groupId, cleanupDefault]);

	// Listen to URL changes (browser back/forward)
	useEffect(() => {
		const urlValue = searchParams.get(paramName);

		// Only react to external changes (not our own writes)
		// Check if URL value is different from what we last synced
		if (urlValue === lastSyncedUrlValue.current) {
			return; // This is our own change, ignore it
		}

		console.log(`[useUrlState:${paramName}] External URL change detected`, {
			urlValue: urlValue,
			lastSynced: lastSyncedUrlValue.current,
		});

		// Update lastSyncedUrlValue to prevent future redundant updates
		lastSyncedUrlValue.current = urlValue;

		// External change detected - update state
		if (urlValue !== null) {
			try {
				const parsed = deserialize(urlValue);
				if (parsed !== state) {
					setState(parsed);
				}
			} catch (error) {
				console.error(`[useUrlState] Failed to deserialize URL param ${paramName}:`, error);
			}
		} else if (cleanupDefault) {
			// If param is removed from URL and cleanup is enabled, reset to default
			if (state !== defaultValue) {
				setState(defaultValue);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams, paramName]);

	const setter = useCallback((value: T | ((prev: T) => T)) => {
		if (typeof value === 'function') {
			setState(prev => (value as (prev: T) => T)(prev));
		} else {
			setState(value);
		}
	}, []);

	return [state, setter];
}
