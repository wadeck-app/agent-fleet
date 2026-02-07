import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Button } from '@framework/components/primitives/Button';
import type { ItemActions } from '@framework/components2/list/EditableListField';
import { Trash2 } from 'lucide-react';

import type { VariableType } from '../../../../app/pages/flows/flow-editor/types/flow-engine.types';

/**
 * ===========================================================================================
 * INPUT DEFINITION RENDERER - Renderer for Flow Input Definitions
 * ===========================================================================================
 *
 * Specialized item renderer for flow input definitions.
 * Used with EditableListField to configure flow-level inputs.
 *
 * Features:
 * - Input name field
 * - Type selector (all 21+ variable types)
 * - Remove button
 * - Clean layout
 *
 * Example usage:
 * ```typescript
 * <EditableListField
 *   items={items}
 *   renderItem={(item, index, actions) => (
 *     <InputDefinitionRenderer item={item} actions={actions} />
 *   )}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface InputDefinitionItem {
	name: string;
	type: VariableType;
}

export interface InputDefinitionRendererProps {
	item: InputDefinitionItem;
	actions: ItemActions<InputDefinitionItem>;
}

const VARIABLE_TYPE_OPTIONS: Array<{ value: VariableType; label: string }> = [
	{ value: 'string', label: 'String' },
	{ value: 'number', label: 'Number' },
	{ value: 'boolean', label: 'Boolean' },
	{ value: 'object', label: 'Object' },
	{ value: 'text', label: 'Text' },
	{ value: 'url', label: 'URL' },
	{ value: 'markdown', label: 'Markdown' },
	{ value: 'integer', label: 'Integer' },
	{ value: 'percentage', label: 'Percentage' },
	{ value: 'duration', label: 'Duration' },
	{ value: 'enum', label: 'Enum' },
	{ value: 'multi-enum', label: 'Multi-Enum' },
	{ value: 'file', label: 'File' },
	{ value: 'folder', label: 'Folder' },
	{ value: 'date', label: 'Date' },
	{ value: 'datetime', label: 'DateTime' },
	{ value: 'regex', label: 'Regex' },
	{ value: 'array', label: 'Array' },
	{ value: 'keyvalue', label: 'Key-Value' },
	{ value: 'password', label: 'Password' },
	{ value: 'priority', label: 'Priority' },
];

export function InputDefinitionRenderer({ item, actions }: InputDefinitionRendererProps) {
	return (
		<div className="flex gap-2 rounded-md border bg-card p-3">
			<div className="flex-1 space-y-1">
				<Label htmlFor={`input-name-${item.name}`} className="text-xs">
					Name
				</Label>
				<Input
					id={`input-name-${item.name}`}
					value={item.name}
					onChange={e => actions.update({ name: e.target.value })}
					placeholder="inputName"
					className="h-8 font-mono"
				/>
			</div>

			<div className="w-40 space-y-1">
				<Label htmlFor={`input-type-${item.name}`} className="text-xs">
					Type
				</Label>
				<Select value={item.type} onValueChange={value => actions.update({ type: value as VariableType })}>
					<SelectTrigger id={`input-type-${item.name}`} className="h-8">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{VARIABLE_TYPE_OPTIONS.map(option => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-end">
				<Button type="button" variant="ghost" size="icon-sm" onClick={actions.remove} title="Remove">
					<Trash2 className="size-4 text-destructive" />
				</Button>
			</div>
		</div>
	);
}
