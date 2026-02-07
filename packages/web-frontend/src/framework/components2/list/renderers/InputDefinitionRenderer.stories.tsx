import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { InputDefinitionRenderer, type InputDefinitionItem } from './InputDefinitionRenderer';

/**
 * InputDefinitionRenderer stories demonstrating the input definition editor.
 * Used within EditableListField to configure flow-level input variables.
 */
const meta = {
	title: 'Framework/Components2/Renderers/InputDefinitionRenderer',
	component: InputDefinitionRenderer,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		item: {
			control: 'object',
			description: 'The input definition item data',
		},
	},
} satisfies Meta<typeof InputDefinitionRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default empty input definition.
 * Shows placeholder text and default string type.
 */
export const Default: Story = {
	args: {
		item: {
			name: '',
			type: 'string',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * String input type (most common).
 * Basic text input variable.
 */
export const StringType: Story = {
	args: {
		item: {
			name: 'username',
			type: 'string',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Number input type.
 * For numeric inputs.
 */
export const NumberType: Story = {
	args: {
		item: {
			name: 'retryCount',
			type: 'number',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Boolean input type.
 * For true/false flags.
 */
export const BooleanType: Story = {
	args: {
		item: {
			name: 'enabled',
			type: 'boolean',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * URL input type.
 * For URL validation and inputs.
 */
export const UrlType: Story = {
	args: {
		item: {
			name: 'apiEndpoint',
			type: 'url',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Password input type.
 * For sensitive data fields.
 */
export const PasswordType: Story = {
	args: {
		item: {
			name: 'apiKey',
			type: 'password',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * File input type.
 * For file path inputs.
 */
export const FileType: Story = {
	args: {
		item: {
			name: 'configFile',
			type: 'file',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Enum input type.
 * For dropdown selections.
 */
export const EnumType: Story = {
	args: {
		item: {
			name: 'environment',
			type: 'enum',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * DateTime input type.
 * For date and time inputs.
 */
export const DateTimeType: Story = {
	args: {
		item: {
			name: 'scheduledAt',
			type: 'datetime',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};

/**
 * Showcase all 21+ variable types.
 * Demonstrates the full range of supported types.
 */
export const AllTypes: Story = {
	render: () => {
		const items: InputDefinitionItem[] = [
			{ name: 'textInput', type: 'string' },
			{ name: 'numericInput', type: 'number' },
			{ name: 'flagInput', type: 'boolean' },
			{ name: 'jsonInput', type: 'object' },
			{ name: 'longTextInput', type: 'text' },
			{ name: 'urlInput', type: 'url' },
			{ name: 'markdownInput', type: 'markdown' },
			{ name: 'integerInput', type: 'integer' },
			{ name: 'percentInput', type: 'percentage' },
			{ name: 'durationInput', type: 'duration' },
			{ name: 'enumInput', type: 'enum' },
			{ name: 'multiEnumInput', type: 'multi-enum' },
			{ name: 'fileInput', type: 'file' },
			{ name: 'folderInput', type: 'folder' },
			{ name: 'dateInput', type: 'date' },
			{ name: 'datetimeInput', type: 'datetime' },
			{ name: 'regexInput', type: 'regex' },
			{ name: 'arrayInput', type: 'array' },
			{ name: 'keyvalueInput', type: 'keyvalue' },
			{ name: 'passwordInput', type: 'password' },
			{ name: 'priorityInput', type: 'priority' },
		];

		return (
			<div className="space-y-2">
				{items.map((item, index) => (
					<InputDefinitionRenderer
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
 * Multiple common inputs.
 * Shows typical flow input configuration.
 */
export const CommonInputs: Story = {
	render: () => {
		const items: InputDefinitionItem[] = [
			{ name: 'projectName', type: 'string' },
			{ name: 'version', type: 'string' },
			{ name: 'timeout', type: 'duration' },
			{ name: 'dryRun', type: 'boolean' },
		];

		return (
			<div className="space-y-2">
				{items.map((item, index) => (
					<InputDefinitionRenderer
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
 * Long input name.
 * Tests UI with longer variable names.
 */
export const LongName: Story = {
	args: {
		item: {
			name: 'veryLongInputVariableNameForTestingLayoutHandling',
			type: 'string',
		},
		actions: {
			update: fn(),
			remove: fn(),
		},
	},
};
