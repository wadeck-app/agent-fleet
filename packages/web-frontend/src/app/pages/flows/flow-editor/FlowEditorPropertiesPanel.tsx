import { useEffect, useState } from 'react';

import { EditableListField } from '@framework/components2/list/EditableListField';
import { type KeyValueItem, KeyValueItemRenderer } from '@framework/components2/list/renderers/KeyValueItemRenderer';
import { type OutputItem, OutputItemRenderer } from '@framework/components2/list/renderers/OutputItemRenderer';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Textarea } from '@framework/components/forms/Textarea';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@framework/components/overlays/AlertDialog';
import { Button } from '@framework/components/primitives/Button';
import { Separator } from '@framework/components/primitives/Separator';
import { useListItems } from '@framework/hooks2/form/useListItems';
import type { ValidationIssue } from 'flow-engine/validation/ValidationTypes';
import { AlertCircle, AlertTriangle, ChevronDown, Info, Trash2 } from 'lucide-react';

import type { ConstantNodeData } from './nodes/ConstantNode';
import type { FlowNode } from './types';
import { isConstantNodeData, isStepNodeData } from './types';
import type { FlowStep } from './types/flow-engine.types';

/**
 * Update data type - can be either FlowStep updates or ConstantNodeData updates
 */
type NodeUpdateData = Partial<FlowStep> | ConstantNodeData;

interface FlowEditorPropertiesPanelProps {
	selectedNode: FlowNode | null;
	onUpdateNode: (nodeId: string, updates: NodeUpdateData) => void;
	onDeleteNode: (nodeId: string) => void;
}

/**
 * Component to display field-specific validation messages inline
 */
function FieldValidationMessage({ issues }: { issues: ValidationIssue[] }) {
	if (issues.length === 0) return null;

	return (
		<div className="mt-2 space-y-2">
			{issues.map((issue, idx) => {
				const Icon =
					issue.severity === 'error' ? AlertCircle : issue.severity === 'warning' ? AlertTriangle : Info;
				const bgColor =
					issue.severity === 'error'
						? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
						: issue.severity === 'warning'
							? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
							: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
				const textColor =
					issue.severity === 'error'
						? 'text-red-800 dark:text-red-200'
						: issue.severity === 'warning'
							? 'text-yellow-800 dark:text-yellow-200'
							: 'text-blue-800 dark:text-blue-200';

				return (
					<div
						key={idx}
						className={`
        rounded-md border p-3
        ${bgColor}
      `}
					>
						<div
							className={`
         flex items-start gap-2 text-xs
         ${textColor}
       `}
						>
							<Icon className="mt-0.5 size-4 flex-shrink-0" />
							<div className="flex-1">
								<div className="font-medium">{issue.message}</div>
								{issue.suggestion && <div className="mt-1 text-xs opacity-80">{issue.suggestion}</div>}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function FlowEditorPropertiesPanel({
	selectedNode,
	onUpdateNode,
	onDeleteNode,
}: FlowEditorPropertiesPanelProps) {
	const [showAdvanced, setShowAdvanced] = useState(false);

	if (!selectedNode) {
		return (
			<div
				className={`
      flex w-96 items-center justify-center border-l bg-card p-4
      text-muted-foreground
    `}
			>
				Select a step to edit properties
			</div>
		);
	}

	// Handle constant nodes (UI-only, different data structure)
	if (selectedNode.type === 'constant' && isConstantNodeData(selectedNode.data)) {
		const constantData = selectedNode.data;
		return (
			<div className="w-96 overflow-auto border-l bg-card">
				<div className="space-y-4 p-4">
					{/* Header */}
					<div>
						<h3 className="mb-1 text-lg font-semibold">Constant Value</h3>
						<p className="text-xs text-muted-foreground">
							Type: <span className="font-mono">{constantData.type}</span>
						</p>
					</div>

					<Separator />

					<div className="space-y-2">
						<Label htmlFor="constantLabel">Label (optional)</Label>
						<Input
							id="constantLabel"
							value={constantData.label || ''}
							onChange={e => {
								// Update constant node data
								const newData: ConstantNodeData = { ...constantData, label: e.target.value };
								onUpdateNode(selectedNode.id, newData);
							}}
							placeholder="Optional label"
						/>
						<p className="text-xs text-muted-foreground">Optional label for this constant</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="constantValue">Value</Label>
						<Textarea
							id="constantValue"
							value={
								constantData.type === 'object'
									? JSON.stringify(constantData.value, null, 2)
									: String(constantData.value ?? '')
							}
							onChange={e => {
								let newValue: string | number | boolean | object = e.target.value;
								// Parse based on type
								if (constantData.type === 'number') {
									newValue = Number(e.target.value);
								} else if (constantData.type === 'boolean') {
									newValue = e.target.value.toLowerCase() === 'true';
								} else if (constantData.type === 'object') {
									try {
										newValue = JSON.parse(e.target.value);
									} catch (_err) {
										// Invalid JSON, keep as string for now
										return;
									}
								}
								const newData: ConstantNodeData = { ...constantData, value: newValue };
								onUpdateNode(selectedNode.id, newData);
							}}
							rows={4}
							placeholder={`Enter ${constantData.type} value`}
						/>
						<p className="text-xs text-muted-foreground">Value of this constant</p>
					</div>

					<Separator />

					{/* Actions */}
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="destructive" size="sm" className="w-full">
								<Trash2 className="mr-2 size-4" />
								Delete Constant
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogMedia>
									<Trash2 className="text-destructive" />
								</AlertDialogMedia>
								<AlertDialogTitle>Delete Constant?</AlertDialogTitle>
								<AlertDialogDescription>
									This action cannot be undone. The constant value will be permanently removed from
									the flow.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction variant="destructive" onClick={() => onDeleteNode(selectedNode.id)}>
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		);
	}

	// Type guard to ensure we have StepNodeData after constant check
	if (!isStepNodeData(selectedNode.data)) {
		return (
			<div className="w-96 overflow-auto border-l bg-card">
				<div className="space-y-4 p-4">
					<div className="text-destructive">Invalid node data structure</div>
				</div>
			</div>
		);
	}

	const step = selectedNode.data.step;

	const handleUpdate = (field: string, value: string) => {
		onUpdateNode(selectedNode.id, { [field]: value } as Partial<FlowStep>);
	};

	// Environment variables list management (only for script steps)
	const stepEnv = step.type === 'script' && 'env' in step ? step.env : undefined;
	const envItems = useListItems<KeyValueItem>({
		initialItems: Object.entries(stepEnv || {}).map(([key, value]) => ({
			key,
			value: String(value),
		})),
		minItems: 0,
	});

	// Sync env items back to step data (only when items change, not on mount)
	useEffect(() => {
		// Only sync for script steps
		if (step.type !== 'script') return;

		const envObj = Object.fromEntries(
			envItems.fstate.items.filter(item => item.key.trim()).map(item => [item.key, item.value])
		);
		// Only update if changed to avoid infinite loop
		const currentEnv = step.type === 'script' && 'env' in step ? step.env || {} : {};
		const isDifferent =
			Object.keys(envObj).length !== Object.keys(currentEnv).length ||
			Object.entries(envObj).some(([k, v]) => currentEnv[k] !== v);
		if (isDifferent) {
			onUpdateNode(selectedNode.id, { env: envObj } as Partial<FlowStep>);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [envItems.fstate.items, step.type]);

	// Output configuration list management
	const outputItems = useListItems<OutputItem>({
		initialItems: Object.entries(step.output || {}).map(([name, config]: [string, any]) => ({
			name,
			type: config.type || 'string',
			pattern: config.pattern,
		})),
		minItems: 0,
	});

	// Sync output items back to step data (only when items change, not on mount)
	useEffect(() => {
		const outputObj = Object.fromEntries(
			outputItems.fstate.items
				.filter(item => item.name.trim())
				.map(item => {
					const config: any = { type: item.type };
					if (item.pattern) {
						config.pattern = item.pattern;
					}
					return [item.name, config];
				})
		);
		// Only update if changed to avoid infinite loop
		const currentOutput = step.output || {};
		const isDifferent =
			Object.keys(outputObj).length !== Object.keys(currentOutput).length ||
			Object.entries(outputObj).some(([k, v]) => JSON.stringify(currentOutput[k]) !== JSON.stringify(v));
		if (isDifferent) {
			onUpdateNode(selectedNode.id, { output: outputObj } as Partial<FlowStep>);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [outputItems.fstate.items]);

	return (
		<div className="w-96 overflow-auto border-l bg-card">
			<div className="space-y-4 p-4">
				{/* Header */}
				<div>
					<h3 className="mb-1 text-lg font-semibold">Step Properties</h3>
					<p className="text-xs text-muted-foreground">
						Type: <span className="font-mono">{step.type}</span>
					</p>
				</div>

				<Separator />

				{/* Common Fields */}
				<div className="space-y-2">
					<Label htmlFor="stepId">Step ID</Label>
					<Input
						id="stepId"
						value={step.id}
						onChange={e => handleUpdate('id', e.target.value)}
						placeholder="Unique identifier"
					/>
					<p className="text-xs text-muted-foreground">Unique identifier for this step</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="stepName">Step Name</Label>
					<Input
						id="stepName"
						value={step.name}
						onChange={e => handleUpdate('name', e.target.value)}
						placeholder="Human-readable name"
					/>
					<p className="text-xs text-muted-foreground">Human-readable name</p>
				</div>

				<Separator />

				{/* Inputs & Outputs Section */}
				{((selectedNode.data.inputPorts?.length ?? 0) > 0 ||
					(selectedNode.data.outputPorts?.length ?? 0) > 0) && (
					<>
						<div className="space-y-4">
							{/* Inputs */}
							{selectedNode.data.inputPorts &&
								Array.isArray(selectedNode.data.inputPorts) &&
								selectedNode.data.inputPorts.length > 0 && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Inputs</Label>
										<div className="space-y-2 rounded-md border bg-muted/30 p-3">
											{selectedNode.data.inputPorts.map(port => (
												<div
													key={port.id}
													className="flex items-center justify-between gap-2 text-sm"
												>
													<div className="flex min-w-0 flex-1 items-center gap-2">
														<span className="truncate font-mono text-xs">{port.name}</span>
														{port.uncertain && (
															<AlertTriangle className="size-3 flex-shrink-0 text-warning" />
														)}
													</div>
													<span
														className={`
               flex-shrink-0 rounded bg-background px-2 py-0.5 font-mono text-xs
               text-muted-foreground
             `}
													>
														{port.type}
													</span>
												</div>
											))}
										</div>
									</div>
								)}

							{/* Outputs */}
							{selectedNode.data.outputPorts &&
								Array.isArray(selectedNode.data.outputPorts) &&
								selectedNode.data.outputPorts.length > 0 && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Outputs</Label>
										<div className="space-y-2 rounded-md border bg-muted/30 p-3">
											{selectedNode.data.outputPorts.map(port => (
												<div
													key={port.id}
													className="flex items-center justify-between gap-2 text-sm"
												>
													<div className="flex min-w-0 flex-1 items-center gap-2">
														<span className="truncate font-mono text-xs">{port.name}</span>
														{port.required && (
															<span className="flex-shrink-0 text-xs text-destructive">
																*
															</span>
														)}
													</div>
													<span
														className={`
               flex-shrink-0 rounded bg-background px-2 py-0.5 font-mono text-xs
               text-muted-foreground
             `}
													>
														{port.type}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
						</div>

						<Separator />
					</>
				)}

				{/* Type-Specific Fields */}
				{step.type === 'model' && (
					<>
						<div className="space-y-2">
							<Label htmlFor="model">Model</Label>
							<select
								id="model"
								value={step.model}
								onChange={e => handleUpdate('model', e.target.value)}
								className={`
          flex h-10 w-full rounded-md border border-input bg-background px-3
          py-2 text-sm
        `}
							>
								<option value="sonnet">Sonnet</option>
								<option value="haiku">Haiku</option>
								<option value="opus">Opus</option>
							</select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="prompt">Prompt</Label>
							<Textarea
								id="prompt"
								value={step.prompt}
								onChange={e => handleUpdate('prompt', e.target.value)}
								rows={10}
								placeholder="Template with variable interpolation support"
							/>
							<p className="text-xs text-muted-foreground">
								Template with variable interpolation support
							</p>
							<FieldValidationMessage
								issues={(Array.isArray(selectedNode.data.validationIssues)
									? selectedNode.data.validationIssues
									: []
								).filter(issue => issue.location?.field === 'prompt')}
							/>
						</div>
					</>
				)}

				{step.type === 'script' && (
					<>
						<div className="space-y-2">
							<Label htmlFor="script">Script</Label>
							<Textarea
								id="script"
								value={step.script}
								onChange={e => handleUpdate('script', e.target.value)}
								rows={10}
								className="font-mono text-sm"
								placeholder="Shell script or command to execute"
							/>
							<p className="text-xs text-muted-foreground">Shell script or command to execute</p>
							<FieldValidationMessage
								issues={(Array.isArray(selectedNode.data.validationIssues)
									? selectedNode.data.validationIssues
									: []
								).filter(issue => issue.location?.field === 'script')}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="workingDir">Working Directory (optional)</Label>
							<Input
								id="workingDir"
								value={step.workingDir || ''}
								onChange={e => handleUpdate('workingDir', e.target.value || '')}
								placeholder="Optional working directory"
							/>
						</div>

						<EditableListField
							label="Environment Variables"
							description="Environment variables to set for script execution"
							items={envItems}
							renderItem={(item, _index, actions) => (
								<KeyValueItemRenderer item={item} actions={actions} />
							)}
							createDefault={() => ({ key: '', value: '' })}
							addButtonLabel="Add Variable"
							emptyMessage="No environment variables defined"
							getItemId={(item, index) => item.key || `env-${index}`}
						/>
					</>
				)}

				{step.type === 'subflow' && (
					<>
						<div className="space-y-2">
							<Label htmlFor="flowId">Flow ID</Label>
							<Input
								id="flowId"
								value={step.flowId}
								onChange={e => handleUpdate('flowId', e.target.value)}
								placeholder="ID of the flow to execute"
							/>
							<p className="text-xs text-muted-foreground">ID of the flow to execute</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="inputs">Inputs (JSON)</Label>
							<Textarea
								id="inputs"
								value={JSON.stringify(step.inputs, null, 2)}
								onChange={e => {
									try {
										const parsed = JSON.parse(e.target.value);
										onUpdateNode(selectedNode.id, { inputs: parsed } as Partial<FlowStep>);
									} catch (_err) {
										// Invalid JSON, ignore
									}
								}}
								rows={6}
								className="font-mono text-sm"
								placeholder="{}"
							/>
							<p className="text-xs text-muted-foreground">Template inputs to pass to the subflow</p>
							<FieldValidationMessage
								issues={(Array.isArray(selectedNode.data.validationIssues)
									? selectedNode.data.validationIssues
									: []
								).filter(issue => issue.location?.field === 'inputs')}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="workspaceStrategy">Workspace Strategy</Label>
							<Select
								value={step.workspaceStrategy || 'inherit'}
								onValueChange={value =>
									onUpdateNode(selectedNode.id, {
										workspaceStrategy: value as 'inherit' | 'separate',
									} as Partial<FlowStep>)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="inherit">Inherit</SelectItem>
									<SelectItem value="separate">Separate</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Inherit: use parent workspace. Separate: create new workspace for subflow
							</p>
						</div>
					</>
				)}

				{step.type === 'user_intervention' && (
					<>
						<div className="space-y-2">
							<Label htmlFor="interventionType">Intervention Type</Label>
							<Select
								value={step.interventionType}
								onValueChange={value =>
									onUpdateNode(selectedNode.id, {
										interventionType: value as 'approval' | 'question' | 'choice',
									} as Partial<FlowStep>)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="approval">Approval</SelectItem>
									<SelectItem value="question">Question</SelectItem>
									<SelectItem value="choice">Choice</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="blocking" className="flex items-center gap-2">
								<Checkbox
									id="blocking"
									checked={step.blocking ?? true}
									onCheckedChange={checked =>
										onUpdateNode(selectedNode.id, {
											blocking: checked as boolean,
										} as Partial<FlowStep>)
									}
								/>
								Blocking (wait for user response)
							</Label>
						</div>

						{/* Timeout Configuration */}
						<div className="space-y-2">
							<Label htmlFor="timeout-minutes">Timeout (optional)</Label>
							<div className="flex gap-2">
								<Input
									id="timeout-minutes"
									type="number"
									value={step.timeout?.minutes || ''}
									onChange={e =>
										onUpdateNode(selectedNode.id, {
											timeout: {
												...step.timeout,
												minutes: Number(e.target.value) || undefined,
												onTimeout: step.timeout?.onTimeout || 'fail',
											},
										} as Partial<FlowStep>)
									}
									placeholder="0"
									className="flex-1"
								/>
								<Select
									value={step.timeout?.onTimeout || 'fail'}
									onValueChange={value =>
										onUpdateNode(selectedNode.id, {
											timeout: step.timeout?.minutes
												? {
														...step.timeout,
														onTimeout: value as 'fail' | 'continue' | 'default',
													}
												: undefined,
										} as Partial<FlowStep>)
									}
									disabled={!step.timeout?.minutes}
								>
									<SelectTrigger className="w-32">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="fail">Fail</SelectItem>
										<SelectItem value="continue">Continue</SelectItem>
										<SelectItem value="default">Default</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<p className="text-xs text-muted-foreground">
								Minutes before timeout. Action: fail (stop), continue (proceed), or use default value
							</p>
						</div>

						{/* Approval Configuration */}
						{step.interventionType === 'approval' && (
							<>
								<div className="space-y-2">
									<Label htmlFor="approval-title">Approval Title</Label>
									<Input
										id="approval-title"
										value={step.approval?.title || ''}
										onChange={e =>
											onUpdateNode(selectedNode.id, {
												approval: { ...step.approval, title: e.target.value },
											} as Partial<FlowStep>)
										}
										placeholder="e.g., Approve Deployment to Production"
									/>
									<FieldValidationMessage
										issues={(Array.isArray(selectedNode.data.validationIssues)
											? selectedNode.data.validationIssues
											: []
										).filter(issue => issue.location?.field === 'approval.title')}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="approval-description">Description (optional)</Label>
									<Textarea
										id="approval-description"
										value={step.approval?.description || ''}
										onChange={e =>
											onUpdateNode(selectedNode.id, {
												approval: { ...step.approval, description: e.target.value },
											} as Partial<FlowStep>)
										}
										rows={3}
										placeholder="Additional context or instructions"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="approval-allowReject" className={`flex items-center gap-2`}>
										<Checkbox
											id="approval-allowReject"
											checked={step.approval?.allowReject ?? true}
											onCheckedChange={checked =>
												onUpdateNode(selectedNode.id, {
													approval: { ...step.approval, allowReject: checked as boolean },
												} as Partial<FlowStep>)
											}
										/>
										Allow Reject
									</Label>
								</div>
							</>
						)}

						{/* Question Configuration */}
						{step.interventionType === 'question' && (
							<>
								<div className="space-y-2">
									<Label htmlFor="question-text">Question</Label>
									<Textarea
										id="question-text"
										value={step.question?.question || ''}
										onChange={e =>
											onUpdateNode(selectedNode.id, {
												question: { ...step.question, question: e.target.value },
											} as Partial<FlowStep>)
										}
										rows={3}
										placeholder="Enter your question here"
									/>
									<FieldValidationMessage
										issues={(Array.isArray(selectedNode.data.validationIssues)
											? selectedNode.data.validationIssues
											: []
										).filter(issue => issue.location?.field === 'question.question')}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="question-responseType">Response Type</Label>
									<Select
										value={step.question?.responseType || 'text'}
										onValueChange={value =>
											onUpdateNode(selectedNode.id, {
												question: {
													...step.question,
													responseType: value as 'text' | 'number' | 'boolean',
												},
											} as Partial<FlowStep>)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="text">Text</SelectItem>
											<SelectItem value="number">Number</SelectItem>
											<SelectItem value="boolean">Boolean</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</>
						)}

						{/* Choice Configuration */}
						{step.interventionType === 'choice' && (
							<>
								<div className="space-y-2">
									<Label htmlFor="choice-question">Question</Label>
									<Textarea
										id="choice-question"
										value={step.choice?.question || ''}
										onChange={e =>
											onUpdateNode(selectedNode.id, {
												choice: { ...step.choice, question: e.target.value },
											} as Partial<FlowStep>)
										}
										rows={3}
										placeholder="What would you like the user to choose?"
									/>
									<FieldValidationMessage
										issues={(Array.isArray(selectedNode.data.validationIssues)
											? selectedNode.data.validationIssues
											: []
										).filter(issue => issue.location?.field === 'choice.question')}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="choice-options">Options (JSON)</Label>
									<Textarea
										id="choice-options"
										value={JSON.stringify(step.choice?.options || [], null, 2)}
										onChange={e => {
											try {
												const parsed = JSON.parse(e.target.value);
												onUpdateNode(selectedNode.id, {
													choice: { ...step.choice, options: parsed },
												} as Partial<FlowStep>);
											} catch (_err) {
												// Invalid JSON, ignore
											}
										}}
										rows={8}
										className="font-mono text-sm"
										placeholder='[{"id": "option1", "label": "Option 1", "description": "..."}]'
									/>
									<p className="text-xs text-muted-foreground">
										Array of options with id, label, and optional description
									</p>
									<FieldValidationMessage
										issues={(Array.isArray(selectedNode.data.validationIssues)
											? selectedNode.data.validationIssues
											: []
										).filter(issue => issue.location?.field === 'choice.options')}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="choice-allowMultiple" className={`flex items-center gap-2`}>
										<Checkbox
											id="choice-allowMultiple"
											checked={step.choice?.allowMultiple ?? false}
											onCheckedChange={checked =>
												onUpdateNode(selectedNode.id, {
													choice: { ...step.choice, allowMultiple: checked as boolean },
												} as Partial<FlowStep>)
											}
										/>
										Allow Multiple Selection
									</Label>
								</div>
							</>
						)}
					</>
				)}

				<Separator />

				{/* Advanced Options */}
				<div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowAdvanced(!showAdvanced)}
						className={`
        flex items-center gap-1 text-sm font-medium
        hover:underline
      `}
					>
						Advanced Options
						<ChevronDown
							className={`
         size-4 transition-transform
         ${showAdvanced ? `rotate-180` : ''}
       `}
						/>
					</Button>
					{showAdvanced && (
						<div className="mt-4 space-y-4">
							<div className="space-y-2">
								<Label htmlFor="when">Condition (when)</Label>
								<Input
									id="when"
									value={step.when || ''}
									onChange={e => handleUpdate('when', e.target.value || '')}
									placeholder="JavaScript expression"
								/>
								<p className="text-xs text-muted-foreground">
									JavaScript expression for conditional execution
								</p>
								<FieldValidationMessage
									issues={(Array.isArray(selectedNode.data.validationIssues)
										? selectedNode.data.validationIssues
										: []
									).filter(issue => issue.location?.field === 'when')}
								/>
							</div>

							<EditableListField
								label="Output Configuration"
								description="Define output variable extraction and transformation"
								items={outputItems}
								renderItem={(item, _index, actions) => (
									<OutputItemRenderer item={item} actions={actions} />
								)}
								createDefault={() => ({ name: '', type: 'string' as OutputItem['type'] })}
								addButtonLabel="Add Output Variable"
								emptyMessage="No output variables defined"
								getItemId={(item, index) => item.name || `output-${index}`}
							/>

							<div className="space-y-2">
								<Label htmlFor="skipOnLoop" className="flex items-center gap-2">
									<Checkbox
										id="skipOnLoop"
										checked={step.skipOnLoop ?? false}
										onCheckedChange={checked =>
											onUpdateNode(selectedNode.id, {
												skipOnLoop: checked as boolean,
											} as Partial<FlowStep>)
										}
									/>
									Skip On Loop
								</Label>
								<p className="text-xs text-muted-foreground">
									Skip this step on retry/loop iterations (only run once)
								</p>
							</div>
						</div>
					)}
				</div>

				<Separator />

				{/* Actions */}
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive" size="sm" className="w-full">
							<Trash2 className="mr-2 size-4" />
							Delete Step
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogMedia>
								<Trash2 className="text-destructive" />
							</AlertDialogMedia>
							<AlertDialogTitle>Delete Step?</AlertDialogTitle>
							<AlertDialogDescription>
								This action cannot be undone. The step and all its connections will be permanently
								removed from the flow.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction variant="destructive" onClick={() => onDeleteNode(selectedNode.id)}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
