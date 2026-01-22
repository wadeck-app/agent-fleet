import { useCallback, useEffect, useState } from 'react';

export type LayoutMode = 'full' | 'split' | 'grid';

export interface PanelState {
	id: string;
	scriptId: string | null; // null = empty panel
}

interface UsePanelLayoutOptions {
	workspaceId: string;
}

interface UsePanelLayoutResult {
	mode: LayoutMode;
	panels: PanelState[];
	setLayoutMode: (mode: LayoutMode) => void;
	addPanel: () => void;
	removePanel: (panelId: string) => void;
	setScriptForPanel: (panelId: string, scriptId: string | null) => void;
	canAddPanel: boolean;
}

const MAX_PANELS_BY_MODE: Record<LayoutMode, number> = {
	full: 1,
	split: 2,
	grid: 4,
};

/**
 * Hook for managing panel layout state
 *
 * Features:
 * - Persist layout mode and panel states in localStorage
 * - Support for Full Width (1 panel), Split (2 panels), Grid 2x2 (4 panels)
 * - Add/remove panels dynamically
 * - Assign scripts to panels
 *
 * Storage key: `workspace-${workspaceId}-panel-layout`
 */
export function usePanelLayout({ workspaceId }: UsePanelLayoutOptions): UsePanelLayoutResult {
	const storageKey = `workspace-${workspaceId}-panel-layout`;

	// Initialize state from localStorage or defaults
	const [mode, setMode] = useState<LayoutMode>(() => {
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				return parsed.mode || 'full';
			}
		} catch (err) {
			console.error('[usePanelLayout] Failed to parse stored layout:', err);
		}
		return 'full';
	});

	const [panels, setPanels] = useState<PanelState[]>(() => {
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed.panels) && parsed.panels.length > 0) {
					return parsed.panels;
				}
			}
		} catch (err) {
			console.error('[usePanelLayout] Failed to parse stored panels:', err);
		}
		// Default: one empty panel
		return [{ id: generatePanelId(), scriptId: null }];
	});

	// Persist to localStorage whenever state changes
	useEffect(() => {
		try {
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					mode,
					panels,
				})
			);
		} catch (err) {
			console.error('[usePanelLayout] Failed to save layout to localStorage:', err);
		}
	}, [mode, panels, storageKey]);

	// Set layout mode and adjust panels accordingly
	const setLayoutMode = useCallback((newMode: LayoutMode) => {
		setMode(newMode);
		setPanels(prevPanels => {
			const maxPanels = MAX_PANELS_BY_MODE[newMode];

			// If we need more panels, add empty ones
			if (prevPanels.length < maxPanels) {
				const newPanels = [...prevPanels];
				while (newPanels.length < maxPanels) {
					newPanels.push({ id: generatePanelId(), scriptId: null });
				}
				return newPanels;
			}

			// If we have too many panels, keep only the first N
			if (prevPanels.length > maxPanels) {
				return prevPanels.slice(0, maxPanels);
			}

			return prevPanels;
		});
	}, []);

	// Add a new empty panel (if allowed by current mode)
	const addPanel = useCallback(() => {
		setPanels(prevPanels => {
			const maxPanels = MAX_PANELS_BY_MODE[mode];
			if (prevPanels.length >= maxPanels) {
				console.warn(`[usePanelLayout] Cannot add more panels in ${mode} mode`);
				return prevPanels;
			}
			return [...prevPanels, { id: generatePanelId(), scriptId: null }];
		});
	}, [mode]);

	// Remove a panel by ID
	const removePanel = useCallback((panelId: string) => {
		setPanels(prevPanels => {
			const filtered = prevPanels.filter(p => p.id !== panelId);
			// Always keep at least one panel
			if (filtered.length === 0) {
				return [{ id: generatePanelId(), scriptId: null }];
			}
			return filtered;
		});
	}, []);

	// Set script for a specific panel
	const setScriptForPanel = useCallback((panelId: string, scriptId: string | null) => {
		setPanels(prevPanels => prevPanels.map(panel => (panel.id === panelId ? { ...panel, scriptId } : panel)));
	}, []);

	// Check if we can add more panels
	const canAddPanel = panels.length < MAX_PANELS_BY_MODE[mode];

	return {
		mode,
		panels,
		setLayoutMode,
		addPanel,
		removePanel,
		setScriptForPanel,
		canAddPanel,
	};
}

/**
 * Generate a unique panel ID
 */
function generatePanelId(): string {
	return `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
