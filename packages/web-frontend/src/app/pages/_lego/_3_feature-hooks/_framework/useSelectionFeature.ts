import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * ===========================================================================================
 * USE SELECTION FEATURE - Row Selection Hook
 * ===========================================================================================
 *
 * Manages selected item ID with URL sync and navigation.
 * Provides prev/next navigation within a list of items.
 *
 * Features:
 * - selectedId state
 * - URL sync via useSearchParams
 * - selectItem(id) to change selection
 * - navigatePrev/navigateNext to move within items array
 *
 * ===========================================================================================
 */

export interface SelectionFeatureHook {
	type: 'selection';
	selectedId: string | null;
	selectItem: (id: string) => void;
	navigatePrev: (items: Array<{ id: string }>) => void;
	navigateNext: (items: Array<{ id: string }>) => void;
}

export interface UseSelectionFeatureOptions {
	initialId?: string;
}

export function useSelectionFeature(options: UseSelectionFeatureOptions = {}): SelectionFeatureHook {
	const [searchParams, setSearchParams] = useSearchParams();
	const [selectedId, setSelectedId] = useState<string | null>(options.initialId || null);

	// intentional: read initial URL state once on mount
	useEffect(() => {
		const idFromUrl = searchParams.get('id');
		if (idFromUrl) {
			setSelectedId(idFromUrl);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const selectItem = (id: string) => {
		setSelectedId(id);
		setSearchParams({ id });
	};

	const navigatePrev = (items: Array<{ id: string }>) => {
		if (!selectedId || items.length === 0) {
			return;
		}

		const currentIndex = items.findIndex(item => item.id === selectedId);
		if (currentIndex > 0) {
			selectItem(items[currentIndex - 1].id);
		}
	};

	const navigateNext = (items: Array<{ id: string }>) => {
		if (!selectedId || items.length === 0) {
			return;
		}

		const currentIndex = items.findIndex(item => item.id === selectedId);
		if (currentIndex >= 0 && currentIndex < items.length - 1) {
			selectItem(items[currentIndex + 1].id);
		}
	};

	return {
		type: 'selection',
		selectedId,
		selectItem,
		navigatePrev,
		navigateNext,
	};
}
