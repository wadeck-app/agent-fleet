import { useEffect, useState } from 'react';

import { EditableListField } from '@framework/components2/list/EditableListField';
import {
	type InputDefinitionItem,
	InputDefinitionRenderer,
} from '@framework/components2/list/renderers/InputDefinitionRenderer';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Switch } from '@framework/components/forms/Switch';
import { Textarea } from '@framework/components/forms/Textarea';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@framework/components/overlays/Dialog';
import { Button } from '@framework/components/primitives/Button';
import { useListItems } from '@framework/hooks2/form/useListItems';

import type {
	ExecutionConfig,
	FlowDefinition,
	GitStrategy,
	ReusePolicy,
	WorkspaceMode,
} from './types/flow-engine.types';

interface FlowSettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	flowDefinition: FlowDefinition;
	onSave: (updates: Partial<FlowDefinition>) => void;
}

export function FlowSettingsDialog({ open, onOpenChange, flowDefinition, onSave }: FlowSettingsDialogProps) {
	const [localFlow, setLocalFlow] = useState<FlowDefinition>(flowDefinition);

	// Update local state when flow definition changes
	useEffect(() => {
		if (flowDefinition.id !== localFlow.id || flowDefinition.version !== localFlow.version) {
			// Initialize with defaults for execution config if not present
			const updatedFlow = {
				...flowDefinition,
				execution: flowDefinition.execution || {
					streamJson: true,
					verbose: true,
					skipPermissions: true,
				},
			};
			setLocalFlow(updatedFlow);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [flowDefinition.id, flowDefinition.version]);

	// Input definitions list management
	const inputItems = useListItems<InputDefinitionItem>({
		initialItems: Object.entries(localFlow.inputs || {}).map(([name, type]) => ({
			name,
			type,
		})),
		minItems: 0,
	});

	// Sync input items back to local flow (only when items change, not on mount)
	useEffect(() => {
		const inputsObj = Object.fromEntries(
			inputItems.fstate.items.filter(item => item.name.trim()).map(item => [item.name, item.type])
		);
		// Only update if changed to avoid infinite loop
		const currentInputs = localFlow.inputs || {};
		const isDifferent =
			Object.keys(inputsObj).length !== Object.keys(currentInputs).length ||
			Object.entries(inputsObj).some(([k, v]) => currentInputs[k] !== v);
		if (isDifferent) {
			setLocalFlow(prev => ({ ...prev, inputs: inputsObj }));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [inputItems.fstate.items]);

	const handleSave = () => {
		onSave({
			version: localFlow.version,
			description: localFlow.description,
			workspace: localFlow.workspace,
			inputs: localFlow.inputs,
			execution: localFlow.execution,
		});
		onOpenChange(false);
	};

	const handleCancel = () => {
		// Reset to original flow definition
		setLocalFlow(flowDefinition);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl" preventOutsideClick>
				<DialogHeader>
					<DialogTitle>Flow Settings</DialogTitle>
				</DialogHeader>

				<DialogBody>
					<div className="space-y-6">
						{/* Version */}
						<div className="space-y-2">
							<Label htmlFor="flow-version">Version</Label>
							<Input
								id="flow-version"
								value={localFlow.version}
								onChange={e =>
									setLocalFlow(prev => ({
										...prev,
										version: e.target.value,
									}))
								}
								placeholder="e.g., 1.0.0"
							/>
							<p className="text-xs text-muted-foreground">Semantic version of the flow (e.g., 1.0.0)</p>
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label htmlFor="flow-description">Description</Label>
							<Textarea
								id="flow-description"
								value={localFlow.description}
								onChange={e =>
									setLocalFlow(prev => ({
										...prev,
										description: e.target.value,
									}))
								}
								rows={3}
								placeholder="Describe what this flow does"
							/>
							<p className="text-xs text-muted-foreground">Brief description of the flow purpose</p>
						</div>

						{/* Workspace Config */}
						<div className="space-y-4">
							<h3 className="text-sm font-semibold">Workspace Configuration</h3>

							<div className="space-y-2">
								<Label htmlFor="workspace-mode">Mode</Label>
								<Select
									value={localFlow.workspace.mode}
									onValueChange={value =>
										setLocalFlow(prev => ({
											...prev,
											workspace: {
												...prev.workspace,
												mode: value as WorkspaceMode,
											},
										}))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="isolated">Isolated</SelectItem>
										<SelectItem value="shared">Shared</SelectItem>
										<SelectItem value="manual">Manual</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Isolated: Fresh workspace per execution. Shared: Reuse existing. Manual:
									User-specified
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="git-strategy">Git Strategy</Label>
								<Select
									value={localFlow.workspace.gitStrategy}
									onValueChange={value =>
										setLocalFlow(prev => ({
											...prev,
											workspace: {
												...prev.workspace,
												gitStrategy: value as GitStrategy,
											},
										}))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="main-only">Main Only</SelectItem>
										<SelectItem value="feature-branch">Feature Branch</SelectItem>
										<SelectItem value="any">Any</SelectItem>
										<SelectItem value="worktree">Worktree</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Which Git branches are allowed for workspace checkout
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="reuse-policy">Reuse Policy</Label>
								<Select
									value={localFlow.workspace.reusePolicy}
									onValueChange={value =>
										setLocalFlow(prev => ({
											...prev,
											workspace: {
												...prev.workspace,
												reusePolicy: value as ReusePolicy,
											},
										}))
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="never">Never</SelectItem>
										<SelectItem value="if-available">If Available</SelectItem>
										<SelectItem value="always">Always</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">When to reuse existing workspaces</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="concurrency-key">Concurrency Key (optional)</Label>
								<Input
									id="concurrency-key"
									value={localFlow.workspace.concurrencyKey || ''}
									onChange={e =>
										setLocalFlow(prev => ({
											...prev,
											workspace: {
												...prev.workspace,
												concurrencyKey: e.target.value || undefined,
											},
										}))
									}
									placeholder="Optional key for workspace locking"
								/>
								<p className="text-xs text-muted-foreground">
									Optional key for workspace concurrency control
								</p>
							</div>
						</div>

						{/* Flow Inputs */}
						<EditableListField
							label="Flow Inputs"
							description="Define input variables that this flow accepts from tasks"
							items={inputItems}
							renderItem={(item, _index, actions) => (
								<InputDefinitionRenderer item={item} actions={actions} />
							)}
							createDefault={() => ({ name: '', type: 'string' as InputDefinitionItem['type'] })}
							addButtonLabel="Add Input"
							emptyMessage="No inputs defined"
							getItemId={(item, index) => item.name || `input-${index}`}
						/>

						{/* Execution Config */}
						<div className="space-y-4">
							<h3 className="text-sm font-semibold">Execution</h3>

							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="stream-json">Stream JSON output</Label>
									<p className="text-xs text-muted-foreground">
										Stream step outputs as JSON for real-time monitoring
									</p>
								</div>
								<Switch
									id="stream-json"
									checked={localFlow.execution?.streamJson ?? true}
									onCheckedChange={checked =>
										setLocalFlow(prev => ({
											...prev,
											execution: {
												...prev.execution,
												streamJson: checked,
											},
										}))
									}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="verbose">Verbose logging</Label>
									<p className="text-xs text-muted-foreground">
										Enable detailed logging for debugging
									</p>
								</div>
								<Switch
									id="verbose"
									checked={localFlow.execution?.verbose ?? true}
									onCheckedChange={checked =>
										setLocalFlow(prev => ({
											...prev,
											execution: {
												...prev.execution,
												verbose: checked,
											},
										}))
									}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="skip-permissions">Skip permissions</Label>
									<p className="text-xs text-muted-foreground">
										Bypass permission checks (use with caution in development only)
									</p>
								</div>
								<Switch
									id="skip-permissions"
									checked={localFlow.execution?.skipPermissions ?? true}
									onCheckedChange={checked =>
										setLocalFlow(prev => ({
											...prev,
											execution: {
												...prev.execution,
												skipPermissions: checked,
											},
										}))
									}
								/>
							</div>
						</div>
					</div>
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
					<Button variant="default" onClick={handleSave}>
						Save Settings
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
