import { useState } from 'react';

/**
 * ===========================================================================================
 * USE SEARCH FEATURE - Search Feature Hook
 * ===========================================================================================
 *
 * React hook that provides search state management for data tables.
 * Returns a typed feature object that widgets can consume.
 *
 * Usage:
 * ```tsx
 * const search = useSearchFeature({ placeholder: 'Search products...' });
 * <HookDataTable features={[search, ...]} />
 * ```
 *
 * ===========================================================================================
 */

export interface SearchFeatureHook {
	type: 'search';
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export interface UseSearchFeatureConfig {
	placeholder?: string;
	defaultValue?: string;
}

export function useSearchFeature(config?: UseSearchFeatureConfig): SearchFeatureHook {
	const [value, setValue] = useState(config?.defaultValue ?? '');

	return {
		type: 'search',
		value,
		onChange: setValue,
		placeholder: config?.placeholder,
	};
}
