import { useState } from 'react';

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
import type { ValidationIssue } from 'flow-engine/validation/ValidationTypes';
import { AlertCircle, AlertTriangle, ChevronDown, Info, Trash2 } from 'lucide-react';

import type { ConstantNodeData } from './nodes/ConstantNode';
import type { FlowNode } from './types';
import type { FlowStep } from './types/flow-engine.types';

interface FlowEditorPropertiesPanelProps {
	selectedNode: FlowNode | null;
	onUpdateNode: (nodeId: string, updates: Partial<FlowStep>) => void;
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
	if (selectedNode.type === 'constant') {
		const constantData = selectedNode.data as unknown as ConstantNodeData;
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
								// Note: This requires special handling in useFlowEditor
								onUpdateNode(selectedNode.id, newData as unknown as Partial<FlowStep>);
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
								onUpdateNode(selectedNode.id, newData as unknown as Partial<FlowStep>);
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

	const step = selectedNode.data.step;

	const handleUpdate = (field: string, value: string) => {
		onUpdateNode(selectedNode.id, { [field]: value } as Partial<FlowStep>);
	};

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
							{selectedNode.data.inputPorts && selectedNode.data.inputPorts.length > 0 && (
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
							{selectedNode.data.outputPorts && selectedNode.data.outputPorts.length > 0 && (
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
								issues={selectedNode.data.validationIssues.filter(
									issue => issue.location?.field === 'prompt'
								)}
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
								issues={selectedNode.data.validationIssues.filter(
									issue => issue.location?.field === 'script'
								)}
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
								issues={selectedNode.data.validationIssues.filter(
									issue => issue.location?.field === 'inputs'
								)}
							/>
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
										issues={selectedNode.data.validationIssues.filter(
											issue => issue.location?.field === 'approval.title'
										)}
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
									<Label
										htmlFor="approval-allowReject"
										className={`
           flex items-center gap-2
         `}
									>
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
										issues={selectedNode.data.validationIssues.filter(
											issue => issue.location?.field === 'question.question'
										)}
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
										issues={selectedNode.data.validationIssues.filter(
											issue => issue.location?.field === 'choice.question'
										)}
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
										issues={selectedNode.data.validationIssues.filter(
											issue => issue.location?.field === 'choice.options'
										)}
									/>
								</div>

								<div className="space-y-2">
									<Label
										htmlFor="choice-allowMultiple"
										className={`
           flex items-center gap-2
         `}
									>
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
									issues={selectedNode.data.validationIssues.filter(
										issue => issue.location?.field === 'when'
									)}
								/>
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
