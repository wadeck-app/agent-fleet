import { useEffect, useRef, useState } from 'react';

import type { UseDataFetchState } from './useDataFetch';

/
  
  USE DATA ACCUMULATOR - Decorator Hook for Data Accumulation
  
 
  This hook wraps data state from useDataFetch and accumulates items progressively.
  It's a pure decorator - doesn't modify the source, just transforms the output.
 
  Key Responsibilities:
  - Detect when new data arrives (different reference)
  - Accumulate new items with existing items
  - Deduplicate items using provided key extractor
  - Detect resets (when data gets smaller)
  - Preserve all other state properties
 
  Pattern: Decorator
  Input: UseDataFetchState<T>
  Output: UseDataFetchState<T> (with accumulated data)
 
  Example Flow:
  . Data fetches page  → [items -]
     useDataAccumulator → [items -] (first fetch)
 
  . Data fetches page  → [items -]
     useDataAccumulator → [items -] (accumulated)
 
  . User changes sort/search → [items -] (smaller = reset)
     useDataAccumulator → [items -] (reset detected)
 /

/
  Options for data accumulator
 /
export interface DataAccumulatorOptions<T> {
	/ Enable accumulation (if false, passes data through unchanged) /
	enabled: boolean;

	/ Extract unique key from item for deduplication /
	deduplicateBy?: (item: T) => string | number;

	/ Callback when reset is detected /
	onReset?: () => void;
}

/
  Extended state with accumulated data
 /
export interface AccumulatedDataState<T> extends UseDataFetchState<T> {
	/ Original data from fetch (before accumulation) /
	originalData: T[];
}

/
  Hook that decorates data state with accumulation behavior.
 
  This hook acts as a pure transformer:
  - Input: Fresh data from each fetch
  - Output: Accumulated data across all fetches
 
  Reset Detection:
  The hook detects resets by comparing data size. If new data is smaller
  than previous data, it's likely a reset (new search, filter, etc.)
 
  @param dataState - Data state from useDataFetch
  @param options - Accumulation options
  @returns Extended state with accumulated data
 
  @example
  ```tsx
  const dataState = useDataFetch(...);
  const accumulated = useDataAccumulator(dataState, {
    enabled: true,
    deduplicateBy: item => item.id,
    onReset: () => console.log('Data reset detected'),
  });
  // accumulated.data contains all items across all fetches
  // accumulated.originalData contains items from latest fetch only
  ```
 /
export function useDataAccumulator<T>(
	dataState: UseDataFetchState<T>,
	options: DataAccumulatorOptions<T>
): AccumulatedDataState<T> {
	const { enabled, deduplicateBy, onReset } = options;

	// Store accumulated data
	const [accumulated, setAccumulated] = useState<T[]>([]);

	// Track previous data to detect changes
	const prevDataRef = useRef<T[]>([]);

	// 
	// ACCUMULATION LOGIC
	// 

	useEffect(() => {
		// If disabled, just pass through the data
		if (!enabled) {
			setAccumulated(dataState.data);
			prevDataRef.current = dataState.data;
			return;
		}

		// Detect if this is a reset (data got smaller or completely different)
		const isReset = dataState.data.length < prevDataRef.current.length;

		if (isReset) {
			// Reset detected - start fresh
			setAccumulated(dataState.data);
			onReset?.();
		}
		// Detect if new data arrived (different reference and has items)
		else if (dataState.data !== prevDataRef.current && dataState.data.length > ) {
			setAccumulated(prev => {
				// If this is the first load (no previous data)
				if (prev.length === ) {
					return dataState.data;
				}

				// Accumulate new items
				const newItems = dataState.data;

				if (deduplicateBy) {
					// Deduplicate using provided key extractor
					const seen = new Set(prev.map(deduplicateBy));
					const unique = newItems.filter(item => !seen.has(deduplicateBy(item)));
					return [...prev, ...unique];
				}

				// No deduplication - just append
				return [...prev, ...newItems];
			});
		}

		// Update reference for next comparison
		prevDataRef.current = dataState.data;
	}, [dataState.data, enabled, deduplicateBy, onReset]);

	// 
	// RETURN: Extended state with accumulated data
	// 

	return {
		...dataState,
		data: accumulated, // Accumulated data
		originalData: dataState.data, // Original data from last fetch (for debugging)
	};
}
