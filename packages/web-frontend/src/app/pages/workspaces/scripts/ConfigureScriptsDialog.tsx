import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';

import { ConfigureScriptsView } from './ConfigureScriptsView';
import { useConfigureScriptsState } from './useConfigureScriptsState';

/**
 * ===========================================================================================
 * CONFIGURE SCRIPTS DIALOG COMPONENT
 * ===========================================================================================
 *
 * Dialog wrapper for configuring workspace scripts with drag & drop reordering.
 * Uses the 3-layer architecture pattern:
 * - Logic layer: useConfigureScriptsState (hook)
 * - Presentation layer: ConfigureScriptsView (pure component)
 * - Composition layer: ConfigureScriptsDialog (this file)
 *
 * Features:
 * - Two-column layout: Configured (left) and Available (right) scripts
 * - Drag & drop to reorder configured scripts
 * - Arrow buttons (→ to remove, ← to add)
 * - Search functionality in available scripts
 * - Auto-save: changes persist immediately to the server
 * - Optimistic updates with rollback on error
 * - Loading states during API calls
 *
 * Usage:
 *   <ConfigureScriptsDialog
 *     workspaceId={workspaceId}
 *     open={isOpen}
 *     onClose={handleClose}
 *     scripts={scripts}
 *   />
 *
 * ===========================================================================================
 */

interface ConfigureScriptsDialogProps {
	workspaceId: string;
	open: boolean;
	onClose: () => void;
	scripts: ScriptProcessWithConfig[];
}

export function ConfigureScriptsDialog({ workspaceId, open, onClose, scripts }: ConfigureScriptsDialogProps) {
	// Extract all state and logic into hook
	const scriptsState = useConfigureScriptsState({
		workspaceId,
		scripts,
		isOpen: open,
	});

	return (
		<CrudDialog open={open} onOpenChange={onClose} title="Configure Scripts" maxWidth="4xl" showCloseButton={true}>
			<ConfigureScriptsView
				{...scriptsState}
				onSearchChange={scriptsState.actions.setSearchQuery}
				onDiscover={scriptsState.actions.handleDiscover}
				onAddScript={scriptsState.actions.handleAddScript}
				onRemoveScript={scriptsState.actions.handleRemoveScript}
				onDragEnd={scriptsState.actions.handleDragEnd}
				getScriptStatus={scriptsState.actions.getScriptStatus}
			/>
		</CrudDialog>
	);
}
