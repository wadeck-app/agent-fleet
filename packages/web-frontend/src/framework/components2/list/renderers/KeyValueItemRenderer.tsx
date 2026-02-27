import type { ItemActions } from '@framework/components2/list/EditableListField';
import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';

/**
 * ===========================================================================================
 * KEY VALUE ITEM RENDERER - Renderer for Environment Variables
 * ===========================================================================================
 *
 * Specialized item renderer for key-value pairs (e.g., environment variables).
 * Used with EditableListField to display and edit KEY=value pairs.
 *
 * Features:
 * - Two input fields: key and value
 * - Remove button
 * - Responsive layout
 * - Placeholder text for guidance
 *
 * Example usage:
 * ```typescript
 * <EditableListField
 *   items={items}
 *   renderItem={(item, index, actions) => (
 *     <KeyValueItemRenderer item={item} actions={actions} />
 *   )}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface KeyValueItem {
	id: string;
	key: string;
	value: string;
}

export interface KeyValueItemRendererProps {
	item: KeyValueItem;
	actions: ItemActions<KeyValueItem>;
}

export function KeyValueItemRenderer({ item, actions }: KeyValueItemRendererProps) {
	return (
		<div className="flex gap-2 rounded-md border bg-card p-3">
			<div className="flex-1 space-y-1">
				<Label htmlFor={`key-${item.id}`} className="text-xs">
					Key
				</Label>
				<Input
					id={`key-${item.id}`}
					value={item.key}
					onChange={e => actions.update({ key: e.target.value })}
					placeholder="KEY"
					className="h-8 font-mono"
				/>
			</div>

			<div className="flex-1 space-y-1">
				<Label htmlFor={`value-${item.id}`} className="text-xs">
					Value
				</Label>
				<Input
					id={`value-${item.id}`}
					value={item.value}
					onChange={e => actions.update({ value: e.target.value })}
					placeholder="value"
					className="h-8"
				/>
			</div>

			<div className="flex items-end">
				<RemoveItemButton onRemove={actions.remove} title="Remove variable" />
			</div>
		</div>
	);
}
