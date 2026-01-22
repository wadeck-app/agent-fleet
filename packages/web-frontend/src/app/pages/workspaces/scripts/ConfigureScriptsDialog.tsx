import { useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Switch } from '@framework/components/forms/Switch';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@framework/components/overlays/Dialog';
import { Button } from '@framework/components/primitives/Button';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { AvailableScript, ScriptProcessWithConfig, WorkspaceScript } from '@shared/api/workspaceScripts.contract';
import { GripVertical, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { workspaceScriptsApi } from './workspaceScripts.api';

interface ConfigureScriptsDialogProps {
	workspaceId: string;
	open: boolean;
	onClose: () => void;
	scripts: ScriptProcessWithConfig[];
	onRefresh: () => void;
}

interface EditingScript extends WorkspaceScript {
	isNew?: boolean;
}

const MAX_SCRIPTS = 10;

/**
 * Modal dialog for configuring workspace scripts
 *
 * Features:
 * - Discover available scripts from package.json
 * - Add/remove/edit script configurations
 * - Drag-and-drop reordering
 * - Validation (max 10 scripts per workspace)
 */
export function ConfigureScriptsDialog({
	workspaceId,
	open,
	onClose,
	scripts,
	onRefresh,
}: ConfigureScriptsDialogProps) {
	const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
	const [editingScripts, setEditingScripts] = useState<EditingScript[]>([]);
	const [isDiscovering, setIsDiscovering] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Initialize editing scripts from props
	useEffect(() => {
		if (open) {
			setEditingScripts(scripts.map(s => ({ ...s.script })));
			setError(null);
		}
	}, [open, scripts]);

	// Discover available scripts from package.json
	const handleDiscover = async () => {
		try {
			setIsDiscovering(true);
			setError(null);
			const discovered = await workspaceScriptsApi.discoverAvailableScripts(workspaceId);
			setAvailableScripts(discovered);
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setIsDiscovering(false);
		}
	};

	// Add a script from available scripts
	const handleAddScript = (scriptName: string) => {
		if (editingScripts.length >= MAX_SCRIPTS) {
			setError(`Maximum ${MAX_SCRIPTS} scripts per workspace`);
			return;
		}

		// Check if already added
		if (editingScripts.some(s => s.scriptName === scriptName)) {
			setError(`Script "${scriptName}" is already configured`);
			return;
		}

		const newScript: EditingScript = {
			id: `temp-${Date.now()}`,
			workspaceId,
			scriptName,
			enabled: true,
			displayName: scriptName,
			description: '',
			url: '',
			order: editingScripts.length,
			autoStart: false,
			restartOnFailure: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
			isNew: true,
		};

		setEditingScripts(prev => [...prev, newScript]);
		setError(null);
	};

	// Remove a script
	const handleRemoveScript = (scriptId: string) => {
		setEditingScripts(prev => prev.filter(s => s.id !== scriptId));
		setError(null);
	};

	// Update a script field
	const handleUpdateScript = (scriptId: string, field: keyof WorkspaceScript, value: unknown) => {
		setEditingScripts(prev => prev.map(s => (s.id === scriptId ? { ...s, [field]: value } : s)));
		setError(null);
	};

	// Save all changes
	const handleSave = async () => {
		try {
			setIsSaving(true);
			setError(null);

			// Find scripts to delete
			const existingIds = scripts.map(s => s.script.id);
			const editingIds = editingScripts.filter(s => !s.isNew).map(s => s.id);
			const toDelete = existingIds.filter(id => !editingIds.includes(id));

			// Find scripts to create
			const toCreate = editingScripts.filter(s => s.isNew);

			// Find scripts to update
			const toUpdate = editingScripts.filter(s => !s.isNew);

			// Execute deletions
			await Promise.all(toDelete.map(id => workspaceScriptsApi.deleteWorkspaceScript(workspaceId, id)));

			// Execute creates
			await Promise.all(
				toCreate.map(script =>
					workspaceScriptsApi.createWorkspaceScript(workspaceId, {
						scriptName: script.scriptName,
						enabled: script.enabled,
						displayName: script.displayName,
						description: script.description,
						url: script.url || undefined,
						order: Number(script.order),
						autoStart: script.autoStart,
						restartOnFailure: script.restartOnFailure,
					})
				)
			);

			// Execute updates
			await Promise.all(
				toUpdate.map(script =>
					workspaceScriptsApi.updateWorkspaceScript(workspaceId, script.id, {
						scriptName: script.scriptName,
						enabled: script.enabled,
						displayName: script.displayName,
						description: script.description,
						url: script.url || undefined,
						order: Number(script.order),
						autoStart: script.autoStart,
						restartOnFailure: script.restartOnFailure,
						version: script.version,
					})
				)
			);

			// Refresh parent list
			onRefresh();
			onClose();
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>Configure Scripts</DialogTitle>
					<DialogDescription>
						Manage npm scripts for this workspace. Maximum {MAX_SCRIPTS} scripts per workspace.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Discover Scripts Section */}
					<div className="rounded border border-border bg-muted/20 p-4">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-sm font-semibold">Available Scripts from package.json</h3>
							<Button variant="outline" size="sm" onClick={handleDiscover} disabled={isDiscovering}>
								<RefreshCw
									className={`
          mr-1 size-4
          ${isDiscovering ? 'animate-spin' : ''}
        `}
								/>
								Discover
							</Button>
						</div>

						{availableScripts.length > 0 ? (
							<div className="space-y-2">
								{availableScripts.map(script => {
									const isAdded = editingScripts.some(s => s.scriptName === script.name);
									return (
										<div
											key={script.name}
											className={`
             flex items-center justify-between rounded border border-border
             bg-card p-3
           `}
										>
											<div className="flex-1">
												<div className="font-mono text-sm font-semibold">{script.name}</div>
												<div className="font-mono text-xs text-muted-foreground">
													{script.command}
												</div>
											</div>
											<Button
												variant="outline"
												size="sm"
												onClick={() => handleAddScript(script.name)}
												disabled={isAdded}
											>
												<Plus className="mr-1 size-4" />
												{isAdded ? 'Added' : 'Add'}
											</Button>
										</div>
									);
								})}
							</div>
						) : (
							<div className="py-8 text-center text-sm text-muted-foreground">
								{isDiscovering ? (
									<div className="flex items-center justify-center gap-2">
										<Loader2 className="size-4 animate-spin" />
										<span>Discovering scripts...</span>
									</div>
								) : (
									'Click "Discover" to find available scripts from package.json'
								)}
							</div>
						)}
					</div>

					{/* Configured Scripts Section */}
					<div className="rounded border border-border bg-muted/20 p-4">
						<h3 className="mb-3 text-sm font-semibold">
							Configured Scripts ({editingScripts.length}/{MAX_SCRIPTS})
						</h3>

						{editingScripts.length > 0 ? (
							<div className="space-y-3">
								{editingScripts.map((script, _index) => (
									<div
										key={script.id}
										className={`
           rounded border border-border bg-card p-4
         `}
									>
										<div className="mb-3 flex items-center gap-2">
											<GripVertical className="size-4 text-muted-foreground" />
											<div className="flex-1 font-mono text-sm font-semibold">
												{script.scriptName}
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleRemoveScript(script.id)}
											>
												<Trash2 className="size-4" />
											</Button>
										</div>

										<div className="grid grid-cols-2 gap-3">
											<div>
												<Label className="text-xs">Display Name</Label>
												<Input
													value={script.displayName || ''}
													onChange={e =>
														handleUpdateScript(script.id, 'displayName', e.target.value)
													}
													placeholder="e.g., Backend Dev"
												/>
											</div>
											<div>
												<Label className="text-xs">URL (optional)</Label>
												<Input
													value={script.url || ''}
													onChange={e => handleUpdateScript(script.id, 'url', e.target.value)}
													placeholder="e.g., http://localhost:3000"
												/>
											</div>
										</div>

										<div className="mt-3">
											<Label className="text-xs">Description (optional)</Label>
											<Input
												value={script.description || ''}
												onChange={e =>
													handleUpdateScript(script.id, 'description', e.target.value)
												}
												placeholder="Optional description"
											/>
										</div>

										<div className="mt-3 flex items-center gap-4">
											<Label className="flex items-center gap-2 text-xs">
												<Switch
													checked={script.enabled}
													onCheckedChange={checked =>
														handleUpdateScript(script.id, 'enabled', checked)
													}
												/>
												<span>Enabled</span>
											</Label>
											<Label className="flex items-center gap-2 text-xs">
												<Switch
													checked={script.autoStart}
													onCheckedChange={checked =>
														handleUpdateScript(script.id, 'autoStart', checked)
													}
												/>
												<span>Auto-start</span>
											</Label>
											<Label className="flex items-center gap-2 text-xs">
												<Switch
													checked={script.restartOnFailure}
													onCheckedChange={checked =>
														handleUpdateScript(script.id, 'restartOnFailure', checked)
													}
												/>
												<span>Restart on failure</span>
											</Label>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center text-sm text-muted-foreground">
								No scripts configured. Add scripts from the section above.
							</div>
						)}
					</div>

					{error && <div className="text-sm text-destructive">{error}</div>}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save Changes'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
