import { createContext, useContext } from 'react';

interface EdgeSelectionContextValue {
	selectEdge: (edgeId: string) => void;
}

const EdgeSelectionContext = createContext<EdgeSelectionContextValue | null>(null);

export const EdgeSelectionProvider = EdgeSelectionContext.Provider;

export function useEdgeSelection() {
	const context = useContext(EdgeSelectionContext);
	if (!context) {
		throw new Error('useEdgeSelection must be used within EdgeSelectionProvider');
	}
	return context;
}
