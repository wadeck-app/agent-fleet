import { useEffect, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { Plus } from 'lucide-react';

import { ConfigureScriptsDialog } from './ConfigureScriptsDialog';
import { LayoutSelector } from './LayoutSelector';
import { QuickActionsBar } from './QuickActionsBar';
import { ScriptPanel } from './ScriptPanel';
import { usePanelLayout } from './usePanelLayout';
import { useWorkspaceScripts } from './useWorkspaceScripts';

interface ScriptsPanelProps {
	workspaceId: string;
}

/**
 * Main container component for workspace scripts management
 *
 * Features:
 * - Quick actions bar (stats, stop all, configure)
 * - Layout selector (full width / split / grid 2x2)
 * - Multiple script panels with flexible layouts
 * - Real-time updates via B2F events
 * - Persistent layout state per workspace
 *
 * Structure:
 * - QuickActionsBar: Shows running count and quick actions
 * - LayoutSelector: Switch between layout modes
 * - ScriptPanel[]: Array of panels based on layout mode
 * - Add Panel button (when applicable)
 */
export function ScriptsPanel({ workspaceId }: ScriptsPanelProps) {
	const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);

	// Fetch scripts with real-time updates
	const { scripts, loading, error, refetch } = useWorkspaceScripts({ workspaceId });

	// Manage panel layout
	const { mode, panels, setLayoutMode, addPanel, removePanel, setScriptForPanel, canAddPanel } = usePanelLayout({
		workspaceId,
	});

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl+Shift+S: Stop all scripts (handled in QuickActionsBar)
			// Ctrl+Shift+P: Add new panel
			if (e.ctrlKey && e.shiftKey && e.key === 'P') {
				e.preventDefault();
				if (canAddPanel) {
					addPanel();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [canAddPanel, addPanel]);

	// Get CSS class for layout
	const getLayoutClassName = (layoutMode: typeof mode): string => {
		switch (layoutMode) {
			case 'full':
				return 'grid grid-cols-1 gap-4';
			case 'split':
				return 'grid grid-cols-2 gap-4';
			case 'grid':
				return 'grid grid-cols-2 grid-rows-2 gap-4';
			default:
				return 'grid grid-cols-1 gap-4';
		}
	};

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<div className="mb-2 text-4xl">⚙️</div>
					<p className="text-sm text-muted-foreground">Loading scripts...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<div className="mb-2 text-4xl">⚠️</div>
					<p className="text-sm text-destructive">Failed to load scripts</p>
					<p className="text-xs text-muted-foreground">{error.message}</p>
					<Button variant="outline" size="sm" onClick={refetch} className="mt-3">
						Retry
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Quick Actions Bar */}
			<QuickActionsBar
				workspaceId={workspaceId}
				scripts={scripts}
				onConfigure={() => setIsConfigDialogOpen(true)}
			/>

			{/* Layout Controls */}
			<div className="flex items-center gap-3 border-b border-border bg-card p-3">
				<span className="text-sm font-medium">Layout:</span>
				<LayoutSelector mode={mode} onChange={setLayoutMode} />

				<div className="flex-1" />

				{/* Add Panel Button */}
				{canAddPanel && (
					<Button variant="outline" size="sm" onClick={addPanel}>
						<Plus className="mr-1 size-4" />
						Add Panel
					</Button>
				)}
			</div>

			{/* Panels Grid */}
			<div className="flex-1 overflow-auto p-4">
				{scripts.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<div className="text-center">
							<div className="mb-2 text-4xl">📜</div>
							<p className="mb-1 text-sm font-medium">No scripts configured</p>
							<p className="mb-3 text-xs text-muted-foreground">
								Click "Configure Scripts" to add npm scripts from package.json
							</p>
							<Button variant="outline" size="sm" onClick={() => setIsConfigDialogOpen(true)}>
								Configure Scripts
							</Button>
						</div>
					</div>
				) : (
					<div className={`h-full ${getLayoutClassName(mode)}`}>
						{panels.map(panel => (
							<ScriptPanel
								key={panel.id}
								panelId={panel.id}
								scriptId={panel.scriptId}
								workspaceId={workspaceId}
								scripts={scripts}
								onScriptChange={scriptId => setScriptForPanel(panel.id, scriptId)}
								onRemove={() => removePanel(panel.id)}
							/>
						))}
					</div>
				)}
			</div>

			{/* Configure Scripts Dialog */}
			<ConfigureScriptsDialog
				workspaceId={workspaceId}
				open={isConfigDialogOpen}
				onClose={() => setIsConfigDialogOpen(false)}
				scripts={scripts}
				onRefresh={refetch}
			/>
		</div>
	);
}
