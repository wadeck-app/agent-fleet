import { useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Button } from '@framework/components/primitives/Button';
import { Plus, Trash2 } from 'lucide-react';

import type { VariableType } from './types/flow-engine.types';

interface FlowInputDefinitionsFieldProps {
	inputs: Record<string, VariableType>;
	onChange: (inputs: Record<string, VariableType>) => void;
}

export function FlowInputDefinitionsField({ inputs, onChange }: FlowInputDefinitionsFieldProps) {
	const [newInputName, setNewInputName] = useState('');
	const [newInputType, setNewInputType] = useState<VariableType>('string');

	const inputEntries = Object.entries(inputs);

	const handleAddInput = () => {
		if (!newInputName.trim()) return;

		// Check for duplicate names
		if (inputs[newInputName]) {
			alert(`Input "${newInputName}" already exists`);
			return;
		}

		onChange({
			...inputs,
			[newInputName]: newInputType,
		});

		// Reset form
		setNewInputName('');
		setNewInputType('string');
	};

	const handleDeleteInput = (name: string) => {
		const newInputs = { ...inputs };
		delete newInputs[name];
		onChange(newInputs);
	};

	const handleUpdateType = (name: string, type: VariableType) => {
		onChange({
			...inputs,
			[name]: type,
		});
	};

	return (
		<div className="space-y-3">
			{/* Existing Inputs List */}
			{inputEntries.length > 0 && (
				<div className="space-y-2 rounded-md border bg-muted/30 p-3">
					{inputEntries.map(([name, type]) => (
						<div key={name} className="flex items-center gap-2">
							<div className="flex-1">
								<span className="font-mono text-sm font-medium">{name}</span>
							</div>
							<Select
								value={type}
								onValueChange={newType => handleUpdateType(name, newType as VariableType)}
							>
								<SelectTrigger className="h-8 w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="string">string</SelectItem>
									<SelectItem value="number">number</SelectItem>
									<SelectItem value="boolean">boolean</SelectItem>
									<SelectItem value="object">object</SelectItem>
									<SelectItem value="text">text</SelectItem>
									<SelectItem value="url">url</SelectItem>
									<SelectItem value="markdown">markdown</SelectItem>
									<SelectItem value="integer">integer</SelectItem>
									<SelectItem value="percentage">percentage</SelectItem>
									<SelectItem value="duration">duration</SelectItem>
									<SelectItem value="enum">enum</SelectItem>
									<SelectItem value="multi-enum">multi-enum</SelectItem>
									<SelectItem value="file">file</SelectItem>
									<SelectItem value="folder">folder</SelectItem>
									<SelectItem value="date">date</SelectItem>
									<SelectItem value="datetime">datetime</SelectItem>
									<SelectItem value="regex">regex</SelectItem>
									<SelectItem value="array">array</SelectItem>
									<SelectItem value="keyvalue">keyvalue</SelectItem>
									<SelectItem value="password">password</SelectItem>
									<SelectItem value="priority">priority</SelectItem>
								</SelectContent>
							</Select>
							<Button variant="ghost" size="icon-sm" onClick={() => handleDeleteInput(name)}>
								<Trash2 className="size-4 text-destructive" />
							</Button>
						</div>
					))}
				</div>
			)}

			{/* Add New Input Form */}
			<div className="flex items-end gap-2">
				<div className="flex-1 space-y-1">
					<Label htmlFor="new-input-name" className="text-xs">
						Name
					</Label>
					<Input
						id="new-input-name"
						value={newInputName}
						onChange={e => setNewInputName(e.target.value)}
						placeholder="inputName"
						onKeyDown={e => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleAddInput();
							}
						}}
						className="h-8"
					/>
				</div>
				<div className="w-32 space-y-1">
					<Label htmlFor="new-input-type" className="text-xs">
						Type
					</Label>
					<Select value={newInputType} onValueChange={value => setNewInputType(value as VariableType)}>
						<SelectTrigger className="h-8">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="string">string</SelectItem>
							<SelectItem value="number">number</SelectItem>
							<SelectItem value="boolean">boolean</SelectItem>
							<SelectItem value="object">object</SelectItem>
							<SelectItem value="text">text</SelectItem>
							<SelectItem value="url">url</SelectItem>
							<SelectItem value="markdown">markdown</SelectItem>
							<SelectItem value="integer">integer</SelectItem>
							<SelectItem value="percentage">percentage</SelectItem>
							<SelectItem value="duration">duration</SelectItem>
							<SelectItem value="enum">enum</SelectItem>
							<SelectItem value="multi-enum">multi-enum</SelectItem>
							<SelectItem value="file">file</SelectItem>
							<SelectItem value="folder">folder</SelectItem>
							<SelectItem value="date">date</SelectItem>
							<SelectItem value="datetime">datetime</SelectItem>
							<SelectItem value="regex">regex</SelectItem>
							<SelectItem value="array">array</SelectItem>
							<SelectItem value="keyvalue">keyvalue</SelectItem>
							<SelectItem value="password">password</SelectItem>
							<SelectItem value="priority">priority</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Button variant="outline" size="sm" onClick={handleAddInput} className="h-8">
					<Plus className="size-4" />
				</Button>
			</div>
		</div>
	);
}
