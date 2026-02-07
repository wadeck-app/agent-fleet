import type { ItemActions } from '@framework/components2/list/EditableListField';
import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Textarea } from '@framework/components/forms/Textarea';

/**
 * ===========================================================================================
 * OUTPUT ITEM RENDERER - Renderer for Output Configuration
 * ===========================================================================================
 *
 * Specialized item renderer for flow step output configuration.
 * Used with EditableListField to configure output variable extraction.
 *
 * Features:
 * - Variable name input
 * - Type selector (string, number, boolean, object, array)
 * - Optional pattern field (for string type extraction)
 * - Remove button
 * - Conditional rendering based on type
 *
 * Example usage:
 * ```typescript
 * <EditableListField
 *   items={items}
 *   renderItem={(item, index, actions) => (
 *     <OutputItemRenderer item={item} actions={actions} />
 *   )}
 * />
 * ```
 *
 * ===========================================================================================
 */

export type OutputType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface OutputItem {
	name: string;
	type: OutputType;
	pattern?: string;
}

export interface OutputItemRendererProps {
	item: OutputItem;
	actions: ItemActions<OutputItem>;
}

export function OutputItemRenderer({ item, actions }: OutputItemRendererProps) {
	return (
		<div className="space-y-3 rounded-md border bg-card p-3">
			{/* Name and Type Row */}
			<div className="flex gap-2">
				<div className="flex-1 space-y-1">
					<Label htmlFor={`output-name-${item.name}`} className="text-xs">
						Variable Name
					</Label>
					<Input
						id={`output-name-${item.name}`}
						value={item.name}
						onChange={e => actions.update({ name: e.target.value })}
						placeholder="myVariable"
						className="h-8 font-mono"
					/>
				</div>

				<div className="w-32 space-y-1">
					<Label htmlFor={`output-type-${item.name}`} className="text-xs">
						Type
					</Label>
					<Select value={item.type} onValueChange={value => actions.update({ type: value as OutputType })}>
						<SelectTrigger id={`output-type-${item.name}`} className="h-8">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="string">String</SelectItem>
							<SelectItem value="number">Number</SelectItem>
							<SelectItem value="boolean">Boolean</SelectItem>
							<SelectItem value="object">Object</SelectItem>
							<SelectItem value="array">Array</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-end">
					<RemoveItemButton onRemove={actions.remove} title="Remove output" />
				</div>
			</div>

			{/* Pattern Field (only for string type) */}
			{item.type === 'string' && (
				<div className="space-y-1">
					<Label htmlFor={`output-pattern-${item.name}`} className="text-xs">
						Extraction Pattern (optional)
					</Label>
					<Textarea
						id={`output-pattern-${item.name}`}
						value={item.pattern || ''}
						onChange={e => actions.update({ pattern: e.target.value })}
						placeholder="Result: (.*)"
						rows={2}
						className="font-mono text-xs"
					/>
					<p className="text-xs text-muted-foreground">
						Regex pattern for extracting the value from output. Examples: <code>Result: (.*)</code> |{' '}
						<code>Score: (\d+)</code> | <code>Status: (pass|fail)</code>
					</p>
				</div>
			)}
		</div>
	);
}
