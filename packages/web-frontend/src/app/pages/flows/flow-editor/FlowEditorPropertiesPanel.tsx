import { useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Button } from '@framework/components/primitives/Button';
import { Separator } from '@framework/components/primitives/Separator';
import { ChevronDown, Trash2 } from 'lucide-react';

import type { FlowNode } from './types';
import type { FlowStep } from './types/flow-engine.types';

interface FlowEditorPropertiesPanelProps {
	selectedNode: FlowNode | null;
	onUpdateNode: (nodeId: string, updates: Partial<FlowStep>) => void;
	onDeleteNode: (nodeId: string) => void;
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
						</div>
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
							</div>
						</div>
					)}
				</div>

				<Separator />

				{/* Actions */}
				<Button
					variant="destructive"
					size="sm"
					onClick={() => onDeleteNode(selectedNode.id)}
					className="w-full"
				>
					<Trash2 className="mr-2 size-4" />
					Delete Step
				</Button>
			</div>
		</div>
	);
}
