import type { Meta, StoryObj } from '@storybook/react';

import { useListItems } from '@framework/hooks2/useListItems';

import { EditableListField } from './EditableListField';
import { KeyValueItemRenderer, type KeyValueItem } from './renderers/KeyValueItemRenderer';

/**
 * EditableListField component stories demonstrating all features and states.
 * A generic composable component for displaying and editing lists of items.
 */
const meta = {
	title: 'Framework/Components2/EditableListField',
	component: EditableListField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof EditableListField>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * List with pre-populated items using KeyValueItemRenderer.
 * Demonstrates basic usage with multiple items.
 */
export const WithItems: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [
				{ key: 'NODE_ENV', value: 'production' },
				{ key: 'DEBUG', value: 'false' },
				{ key: 'PORT', value: '3000' },
			],
		});

		return (
			<EditableListField
				label="Environment Variables"
				description="Configure environment variables for the script"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * Empty list with custom empty message.
 * Shows the dashed border empty state.
 */
export const Empty: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [],
		});

		return (
			<EditableListField
				label="Environment Variables"
				description="No variables configured yet"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				emptyMessage="No environment variables defined. Click 'Add Variable' to create one."
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * List at maximum capacity.
 * The "Add Item" button is disabled when maxItems is reached.
 */
export const MaxItems: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [
				{ key: 'VAR1', value: 'value1' },
				{ key: 'VAR2', value: 'value2' },
				{ key: 'VAR3', value: 'value3' },
			],
			maxItems: 3,
		});

		return (
			<EditableListField
				label="Limited Variables (Max 3)"
				description="This list cannot exceed 3 items"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * List at minimum capacity.
 * Items cannot be removed when the list is at minItems.
 */
export const MinItems: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [{ key: 'REQUIRED_VAR', value: 'required_value' }],
			minItems: 1,
		});

		return (
			<EditableListField
				label="Required Variables (Min 1)"
				description="At least one variable must be present"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * List with drag-and-drop reordering enabled.
 * Items can be dragged by the grip handle to reorder them.
 */
export const WithDragDrop: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [
				{ key: 'FIRST', value: '1' },
				{ key: 'SECOND', value: '2' },
				{ key: 'THIRD', value: '3' },
				{ key: 'FOURTH', value: '4' },
			],
		});

		return (
			<EditableListField
				label="Reorderable Variables"
				description="Drag items by the grip handle to reorder them"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				enableReordering
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * List without drag-and-drop (static order).
 * No grip handles are shown; items stay in fixed order.
 */
export const WithoutDragDrop: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [
				{ key: 'STATIC_1', value: 'value1' },
				{ key: 'STATIC_2', value: 'value2' },
				{ key: 'STATIC_3', value: 'value3' },
			],
		});

		return (
			<EditableListField
				label="Static Variables"
				description="Items cannot be reordered"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				enableReordering={false}
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * List with validation error.
 * Shows how error messages are displayed below the list.
 */
export const WithError: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [{ key: '', value: 'missing_key' }],
		});

		return (
			<EditableListField
				label="Invalid Variables"
				description="This list has validation errors"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				error="All variables must have a non-empty key"
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};

/**
 * Custom empty state renderer.
 * Demonstrates using renderEmpty to provide a custom component.
 */
export const CustomEmptyState: Story = {
	render: () => {
		const items = useListItems<KeyValueItem>({
			initialItems: [],
		});

		return (
			<EditableListField
				label="Custom Empty UI"
				items={items}
				renderItem={(item, _index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
				createDefault={() => ({ key: '', value: '' })}
				addButtonLabel="Add Variable"
				renderEmpty={() => (
					<div className="text-center">
						<p className="mb-2 text-sm font-semibold text-muted-foreground">No variables configured</p>
						<p className="text-xs text-muted-foreground">
							Environment variables will be passed to your script at runtime
						</p>
					</div>
				)}
				getItemId={item => item.key || `env-${Math.random()}`}
			/>
		);
	},
};
