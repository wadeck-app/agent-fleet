import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { OutputItemRenderer, type OutputItem } from './OutputItemRenderer';

/**
 * OutputItemRenderer stories demonstrating the output configuration editor.
 * Used within EditableListField to configure flow step output variables.
 */
const meta = {
	title: 'Framework/Components2/Renderers/OutputItemRenderer',
	component: OutputItemRenderer,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		item: {
			control: 'object',
			description: 'The output item configuration',
		},
	},
} satisfies Meta<typeof OutputItemRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * String output type with pattern field visible.
 * The pattern field appears only for string types.
 */
export const StringType: Story = {
	args: {
		item: {
			name: 'result',
			type: 'string',
			pattern: '',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Number output type (no pattern field).
 * Pattern field is hidden for non-string types.
 */
export const NumberType: Story = {
	args: {
		item: {
			name: 'exitCode',
			type: 'number',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Boolean output type.
 * Simple boolean extraction without pattern.
 */
export const BooleanType: Story = {
	args: {
		item: {
			name: 'success',
			type: 'boolean',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Object output type.
 * For extracting structured JSON objects.
 */
export const ObjectType: Story = {
	args: {
		item: {
			name: 'metadata',
			type: 'object',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Array output type.
 * For extracting lists or arrays from output.
 */
export const ArrayType: Story = {
	args: {
		item: {
			name: 'items',
			type: 'array',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * String with regex pattern filled.
 * Shows pattern field with a regex for extraction.
 */
export const WithPattern: Story = {
	args: {
		item: {
			name: 'version',
			type: 'string',
			pattern: 'Version: (\\d+\\.\\d+\\.\\d+)',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Showcase all 5 output types.
 * Demonstrates how different types look when rendered.
 */
export const AllTypes: Story = {
	render: () => {
		const items: OutputItem[] = [
			{ name: 'message', type: 'string', pattern: 'Result: (.*)' },
			{ name: 'count', type: 'number' },
			{ name: 'isValid', type: 'boolean' },
			{ name: 'data', type: 'object' },
			{ name: 'tags', type: 'array' },
		];

		return (
			<div className="space-y-3">
				{items.map((item, index) => (
					<OutputItemRenderer
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
};

/**
 * Empty state for new output.
 * Shows how a newly added output looks.
 */
export const Empty: Story = {
	args: {
		item: {
			name: '',
			type: 'string',
			pattern: '',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Long variable name and pattern.
 * Tests UI with longer text content.
 */
export const LongContent: Story = {
	args: {
		item: {
			name: 'veryLongVariableNameForTestingLayout',
			type: 'string',
			pattern:
				'This is a very long regex pattern that might be used for complex extraction: (\\w+)\\s+(\\d+)\\s+(\\w+)',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};
