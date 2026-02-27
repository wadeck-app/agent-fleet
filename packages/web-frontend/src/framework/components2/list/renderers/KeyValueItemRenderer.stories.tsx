import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { type KeyValueItem, KeyValueItemRenderer } from './KeyValueItemRenderer';

/**
 * KeyValueItemRenderer stories demonstrating the key-value pair editor.
 * Used within EditableListField to render environment variables.
 */
const meta = {
	title: 'Framework/Components2/Renderers/KeyValueItemRenderer',
	component: KeyValueItemRenderer,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		item: {
			control: 'object',
			description: 'The key-value item data',
		},
	},
} satisfies Meta<typeof KeyValueItemRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default key-value pair with empty fields.
 * Shows placeholder text in both inputs.
 */
export const Default: Story = {
	args: {
		item: { id: 'item-1', key: '', value: '' },
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Key-value pair with both fields populated.
 * Typical usage for environment variables.
 */
export const WithValues: Story = {
	args: {
		item: { id: 'item-1', key: 'NODE_ENV', value: 'production' },
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Testing long values for text overflow.
 * Ensures the UI handles long strings gracefully.
 */
export const LongValues: Story = {
	args: {
		item: {
			id: 'item-1',
			key: 'VERY_LONG_ENVIRONMENT_VARIABLE_KEY_NAME',
			value: 'This is a very long value that should be handled gracefully by the input field without breaking layout',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Special characters in key and value.
 * Tests handling of special characters and symbols.
 */
export const WithSpecialCharacters: Story = {
	args: {
		item: {
			id: 'item-1',
			key: 'API_KEY_$SECRET',
			value: 'sk-1234567890@#$%^&*()',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Multiple items showcase.
 * Shows how multiple renderers look when stacked.
 */
export const MultipleItems = {
	render: () => {
		const items: KeyValueItem[] = [
			{ id: 'item-1', key: 'NODE_ENV', value: 'production' },
			{ id: 'item-2', key: 'DEBUG', value: 'false' },
			{ id: 'item-3', key: 'PORT', value: '3000' },
		];

		return (
			<div className="space-y-2">
				{items.map((item, index) => (
					<KeyValueItemRenderer
						key={index}
						item={item}
						actions={{
							update: fn(),
							remove: fn(),
						}}
					/>
				))}
			</div>
		);
	},
} as unknown as Story;
