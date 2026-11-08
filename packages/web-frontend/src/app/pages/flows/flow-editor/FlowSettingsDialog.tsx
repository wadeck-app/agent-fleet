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

import type { FlowDefinition } from './types/flow-engine.types';
import {
	POOL_COUNT_MAX,
	POOL_COUNT_MIN,
	changeWorkspaceProvider,
	getProviderOptionKeys,
	isCountInRange,
	readWorkspaceDeclaration,
	setWorkspaceOption,
} from './workspaceDeclaration';

const UNSUPPORTED_PROVIDER_VALUE = '__unsupported__';

interface WorkspaceOptionField {
	key: string;
	label: string;
	placeholder: string;
	required?: boolean;
	type?: 'text' | 'number';
}

const WORKSPACE_OPTION_FIELDS: Record<string, WorkspaceOptionField> = {
	dir: { key: 'dir', label: 'Directory (optional)', placeholder: 'e.g., .workspaces' },
	baseDir: { key: 'baseDir', label: 'Base directory', placeholder: 'e.g., .worktrees', required: true },
	prefix: { key: 'prefix', label: 'Prefix (optional)', placeholder: 'e.g., run-' },
	count: {
		key: 'count',
		label: 'Count (optional)',
		placeholder: `${POOL_COUNT_MIN} to ${POOL_COUNT_MAX}`,
		type: 'number',
	},
};

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

	const workspace = readWorkspaceDeclaration(localFlow.workspace);
	const optionFields =
		workspace.unsupported === null && workspace.provider !== null
			? getProviderOptionKeys(workspace.provider).map(key => WORKSPACE_OPTION_FIELDS[key])
			: [];

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
								<Label htmlFor="workspace-provider">Provider</Label>
								<Select
									value={
										workspace.unsupported ? UNSUPPORTED_PROVIDER_VALUE : (workspace.provider ?? '')
									}
									onValueChange={value => {
										// The unsupported item is disabled; never rewrite the declaration for it
										if (value === UNSUPPORTED_PROVIDER_VALUE) {
											return;
										}
										setLocalFlow(prev => ({
											...prev,
											workspace: changeWorkspaceProvider(prev.workspace, value),
										}));
									}}
								>
									<SelectTrigger id="workspace-provider" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="in-place">In place: the project folder, shared</SelectItem>
										<SelectItem value="readonly">Read-only: shared folder, advisory</SelectItem>
										<SelectItem value="worktree">Git worktree: a new branch per run</SelectItem>
										<SelectItem value="pool">
											Pool: one free prepared folder, waits when none is free
										</SelectItem>
										{workspace.unsupported && (
											<SelectItem value={UNSUPPORTED_PROVIDER_VALUE} disabled>
												(unsupported: {workspace.unsupported})
											</SelectItem>
										)}
									</SelectContent>
								</Select>
								{workspace.unsupported && (
									<p className="text-xs text-destructive">
										This workspace declaration ({workspace.unsupported}) cannot be edited here. It
										is kept as is until you pick a provider.
									</p>
								)}
							</div>

							{optionFields.map(field => {
								const raw = workspace.options[field.key];
								const text = raw === undefined || raw === null ? '' : String(raw);
								const countOutOfRange =
									field.key === 'count' && typeof raw === 'number' && !isCountInRange(raw);
								const missingRequired = field.required && text.trim() === '';
								return (
									<div key={field.key} className="space-y-2">
										<Label htmlFor={`workspace-${field.key}`}>{field.label}</Label>
										<Input
											id={`workspace-${field.key}`}
											type={field.type ?? 'text'}
											{...(field.type === 'number'
												? { min: POOL_COUNT_MIN, max: POOL_COUNT_MAX }
												: {})}
											value={text}
											onChange={e => {
												const nextValue = e.target.value;
												setLocalFlow(prev => ({
													...prev,
													workspace: setWorkspaceOption(prev.workspace, field.key, nextValue),
												}));
											}}
											placeholder={field.placeholder}
										/>
										{missingRequired && (
											<p className="text-xs text-destructive">
												This option is required by this provider.
											</p>
										)}
										{countOutOfRange && (
											<p className="text-xs text-destructive">
												Count must be between {POOL_COUNT_MIN} and {POOL_COUNT_MAX}.
											</p>
										)}
									</div>
								);
							})}

							{optionFields.length > 0 && (
								<p className="text-xs text-muted-foreground">
									Relative paths are relative to the project folder.
								</p>
							)}
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
