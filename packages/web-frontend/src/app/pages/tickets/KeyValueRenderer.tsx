import type { ItemActions } from '@framework/components2/list/EditableListField';
import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import type { KeyValueItem } from '@framework/components2/list/renderers/KeyValueItemRenderer';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';

// KeyValueRenderer component for custom fields
export function KeyValueRenderer({
	item,
	actions,
	originalFields,
	originalKey,
}: {
	item: KeyValueItem;
	actions: ItemActions<KeyValueItem>;
	originalFields?: Record<string, string>;
	/** undefined = newly added row (not from saved ticket) */
	originalKey?: string;
}) {
	// New row: originalKey not in map → ring on CARD
	// Existing row key changed → ring on KEY input
	// Existing row value changed → ring on VALUE input
	const isAddedRow = originalKey === undefined;
	const isKeyModified = !isAddedRow && item.key !== originalKey;
	const isValueModified =
		!isAddedRow && originalKey !== undefined && item.value !== (originalFields ?? {})[originalKey];

	return (
		<div className={`flex gap-2 rounded-md border bg-card p-3 ${isAddedRow ? 'ring-1 ring-primary' : ''}`}>
			<div className="flex-1 space-y-1">
				<Label htmlFor={`key-${item.id}`} className="text-xs">
					Key
				</Label>
				<Input
					id={`key-${item.id}`}
					value={item.key}
					onChange={e => actions.update({ key: e.target.value })}
					placeholder="key"
					className={`h-8 ${isKeyModified ? 'ring-1 ring-primary' : ''}`}
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
					className={`h-8 ${isValueModified ? 'ring-1 ring-primary' : ''}`}
				/>
			</div>

			<div className="flex items-end">
				<RemoveItemButton onRemove={actions.remove} title="Remove field" />
			</div>
		</div>
	);
}
