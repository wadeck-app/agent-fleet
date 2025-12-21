import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { TextAreaInput } from './TextAreaInput';

const meta = {
	title: 'Features/Form/Inputs/TextAreaInput',
	component: TextAreaInput,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof TextAreaInput>;

export default meta;
type Story = StoryObj<typeof TextAreaInput>;

const TextAreaInputWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <TextAreaInput {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: TextAreaInputWrapper,
	args: {
		placeholder: 'Enter your text...',
		rows: 4,
	},
};
export const WithValue: Story = {
	render: TextAreaInputWrapper,
	args: {
		value: 'This is a sample text.\nWith multiple lines.\nTo demonstrate the textarea.',
		rows: 6,
	},
};
export const TallTextArea: Story = {
	render: TextAreaInputWrapper,
	args: {
		placeholder: 'Tall textarea',
		rows: 10,
	},
};
export const Disabled: Story = {
	render: TextAreaInputWrapper,
	args: {
		value: 'This textarea is disabled',
		disabled: true,
		rows: 4,
	},
};
