import { useCallback, useState } from 'react';

export interface UseTableExpansionProps {
	defaultExpandedIds?: Set<string>;
	expandedIds?: Set<string>;
	onExpandedChange?: (expandedIds: Set<string>) => void;
}

export interface UseTableExpansionReturn {
	expandedIds: Set<string>;
	toggleExpanded: (id: string) => void;
	isExpanded: (id: string) => boolean;
	expandAll: (allIds: string[]) => void;
	collapseAll: () => void;
}

export function useTableExpansion({
	defaultExpandedIds = new Set(),
	expandedIds: controlledExpandedIds,
	onExpandedChange,
}: UseTableExpansionProps = {}): UseTableExpansionReturn {
	const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(defaultExpandedIds);

	// Use controlled state if provided, otherwise use internal state
	const expandedIds = controlledExpandedIds ?? internalExpandedIds;

	const toggleExpanded = useCallback(
		(id: string) => {
			if (onExpandedChange) {
				const next = new Set(expandedIds);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				onExpandedChange(next);
			} else {
				setInternalExpandedIds(prev => {
					const next = new Set(prev);
					if (next.has(id)) {
						next.delete(id);
					} else {
						next.add(id);
					}
					return next;
				});
			}
		},
		[expandedIds, onExpandedChange]
	);

	const isExpanded = useCallback((id: string) => expandedIds.has(id), [expandedIds]);

	const expandAll = useCallback(
		(allIds: string[]) => {
			const next = new Set(allIds);
			if (onExpandedChange) {
				onExpandedChange(next);
			} else {
				setInternalExpandedIds(next);
			}
		},
		[onExpandedChange]
	);

	const collapseAll = useCallback(() => {
		const next = new Set<string>();
		if (onExpandedChange) {
			onExpandedChange(next);
		} else {
			setInternalExpandedIds(next);
		}
	}, [onExpandedChange]);

	return {
		expandedIds,
		toggleExpanded,
		isExpanded,
		expandAll,
		collapseAll,
	};
}
