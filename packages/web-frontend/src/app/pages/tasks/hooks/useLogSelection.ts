import { useCallback, useEffect, useMemo, useState } from 'react';

import type { LogEntry } from '@shared/api/tasks.contract';

interface UseLogSelectionResult {
	selectedLogIds: Set<string>;
	anchorLogId: string | null;
	handleLogClick: (logId: string, shiftKey: boolean) => void;
	scrollToSelection: () => void;
}

/**
 * Hook for managing log entry selection with GitHub-style URL hash permalinks
 *
 * URL format:
 * - Single line: #log-{logId}
 * - Range: #log-{startLogId}:{endLogId}
 *
 * Behavior:
 * - Click: select single entry, update URL hash (click again to deselect)
 * - Shift+click: select range from anchor to clicked entry
 * - Page load with hash: parse and restore selection
 */
export function useLogSelection(logs: LogEntry[]): UseLogSelectionResult {
	const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
	const [anchorLogId, setAnchorLogId] = useState<string | null>(null);
	const [shouldScrollToSelection, setShouldScrollToSelection] = useState(false);

	// Create a lookup map for efficient range selection
	const logIdToIndex = useMemo(() => {
		const map = new Map<string, number>();
		logs.forEach((log, index) => {
			map.set(log.id, index);
		});
		return map;
	}, [logs]);

	// Parse hash on mount only (not when logs change)
	// We use a ref to track if we've already initialized from hash
	const [hasInitializedFromHash, setHasInitializedFromHash] = useState(false);

	useEffect(() => {
		// Only parse hash once on mount or when logs first load
		if (hasInitializedFromHash || logs.length === 0) return;

		const hash = window.location.hash;
		if (!hash.startsWith('#log-')) {
			setHasInitializedFromHash(true);
			return;
		}

		const hashValue = hash.slice(5); // Remove '#log-'
		const selection = new Set<string>();

		if (hashValue.includes(':')) {
			// Range selection: #log-{startId}:{endId}
			const [startId, endId] = hashValue.split(':');
			const startIndex = logIdToIndex.get(startId);
			const endIndex = logIdToIndex.get(endId);

			if (startIndex !== undefined && endIndex !== undefined) {
				const minIndex = Math.min(startIndex, endIndex);
				const maxIndex = Math.max(startIndex, endIndex);

				for (let i = minIndex; i <= maxIndex; i++) {
					if (logs[i]) {
						selection.add(logs[i].id);
					}
				}

				setAnchorLogId(startId);
			}
		} else {
			// Single selection: #log-{logId}
			if (logIdToIndex.has(hashValue)) {
				selection.add(hashValue);
				setAnchorLogId(hashValue);
			}
		}

		if (selection.size > 0) {
			setSelectedLogIds(selection);
			setShouldScrollToSelection(true);
		}

		setHasInitializedFromHash(true);
	}, [logs, logIdToIndex, hasInitializedFromHash]);

	// Handle log entry click
	const handleLogClick = useCallback(
		(logId: string, shiftKey: boolean) => {
			if (shiftKey && anchorLogId && anchorLogId !== logId) {
				// Range selection
				const anchorIndex = logIdToIndex.get(anchorLogId);
				const clickedIndex = logIdToIndex.get(logId);

				if (anchorIndex !== undefined && clickedIndex !== undefined) {
					const minIndex = Math.min(anchorIndex, clickedIndex);
					const maxIndex = Math.max(anchorIndex, clickedIndex);

					const rangeSelection = new Set<string>();
					for (let i = minIndex; i <= maxIndex; i++) {
						if (logs[i]) {
							rangeSelection.add(logs[i].id);
						}
					}

					setSelectedLogIds(rangeSelection);

					// Update URL hash with range
					const startId = anchorIndex < clickedIndex ? anchorLogId : logId;
					const endId = anchorIndex < clickedIndex ? logId : anchorLogId;
					window.history.replaceState(null, '', `#log-${startId}:${endId}`);
				}
			} else if (selectedLogIds.size === 1 && selectedLogIds.has(logId)) {
				// Toggle off: clicking an already-selected single entry deselects it
				setSelectedLogIds(new Set());
				setAnchorLogId(null);

				// Remove URL hash
				window.history.replaceState(null, '', window.location.pathname + window.location.search);
			} else {
				// Single selection
				setSelectedLogIds(new Set([logId]));
				setAnchorLogId(logId);

				// Update URL hash
				window.history.replaceState(null, '', `#log-${logId}`);
			}
		},
		[anchorLogId, logIdToIndex, logs, selectedLogIds]
	);

	// Scroll to selection (called from parent after render)
	const scrollToSelection = useCallback(() => {
		if (!shouldScrollToSelection || selectedLogIds.size === 0) return;

		// Find the first selected log element
		const firstSelectedId = Array.from(selectedLogIds)[0];
		const element = document.querySelector(`[data-log-id="${firstSelectedId}"]`);

		if (element) {
			element.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}

		setShouldScrollToSelection(false);
	}, [shouldScrollToSelection, selectedLogIds]);

	return {
		selectedLogIds,
		anchorLogId,
		handleLogClick,
		scrollToSelection,
	};
}
