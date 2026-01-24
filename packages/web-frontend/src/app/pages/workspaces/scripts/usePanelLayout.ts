import { useCallback, useEffect, useState } from 'react';

import { useUrlState } from '@framework/hooks/useUrlState';
import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';

export type LayoutMode = 'full' | 'split' | 'grid';

export interface PanelState {
	id: string;
	scriptName: string | null;
}

interface UsePanelLayoutOptions {
	workspaceId: string;
	scripts?: ScriptProcessWithConfig[];
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
 * Hook for managing panel layout state with URL persistence
 */
export function usePanelLayout({ workspaceId: _workspaceId }: UsePanelLayoutOptions): UsePanelLayoutResult {
	// URL state for layout mode
	const [mode, setMode] = useUrlState<LayoutMode>({
		key: 'layout',
		defaultValue: 'full',
	});

	// URL state for panels (serialized as comma-separated script names)
	const [panelScriptNames, setPanelScriptNames] = useUrlState<string[]>({
		key: 'panels',
		defaultValue: [],
		serialize: names => names.filter(Boolean).map(encodeURIComponent).join(','),
		deserialize: str => str.split(',').map(decodeURIComponent).filter(Boolean),
		cleanupDefault: true,
	});

	// Internal state for panel IDs (generated, not persisted)
	// Initialize with correct count based on mode
	const [panelIds, setPanelIds] = useState<string[]>(() => {
		const initialMaxPanels = MAX_PANELS_BY_MODE[mode];
		const initialCount = Math.max(initialMaxPanels, panelScriptNames.length, 1);
		return Array.from({ length: initialCount }, () => generatePanelId());
	});

	// Sync panel count with mode
	useEffect(() => {
		const maxPanels = MAX_PANELS_BY_MODE[mode];
		setPanelIds(prev => {
			if (prev.length < maxPanels) {
				const newIds = [...prev];
				while (newIds.length < maxPanels) {
					newIds.push(generatePanelId());
				}
				return newIds;
			}
			if (prev.length > maxPanels) {
				return prev.slice(0, maxPanels);
			}
			return prev;
		});

		setPanelScriptNames(prev => {
			if (prev.length > maxPanels) {
				return prev.slice(0, maxPanels);
			}
			return prev;
		});
	}, [mode, setPanelScriptNames]);

	// Combine IDs and script names into panel states
	const panels: PanelState[] = panelIds.map((id, index) => ({
		id,
		scriptName: panelScriptNames[index] || null,
	}));

	const setLayoutMode = useCallback(
		(newMode: LayoutMode) => {
			setMode(newMode);
		},
		[setMode]
	);

	const addPanel = useCallback(() => {
		const maxPanels = MAX_PANELS_BY_MODE[mode];
		if (panelIds.length >= maxPanels) {
			console.warn(`[usePanelLayout] Cannot add more panels in ${mode} mode`);
			return;
		}
		setPanelIds(prev => [...prev, generatePanelId()]);
	}, [mode, panelIds.length]);

	const removePanel = useCallback(
		(panelId: string) => {
			const index = panelIds.indexOf(panelId);
			if (index === -1) return;

			setPanelIds(prev => {
				const newIds = prev.filter(id => id !== panelId);
				return newIds.length === 0 ? [generatePanelId()] : newIds;
			});

			setPanelScriptNames(prev => prev.filter((_, i) => i !== index));
		},
		[panelIds, setPanelScriptNames]
	);

	const setScriptForPanel = useCallback(
		(panelId: string, scriptName: string | null) => {
			const index = panelIds.indexOf(panelId);
			if (index === -1) return;

			setPanelScriptNames(prev => {
				const newScriptNames = [...prev];
				newScriptNames[index] = scriptName || '';
				return newScriptNames;
			});
		},
		[panelIds, setPanelScriptNames]
	);

	const canAddPanel = panelIds.length < MAX_PANELS_BY_MODE[mode];

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

function generatePanelId(): string {
	return `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
