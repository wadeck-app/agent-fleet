import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { TextAreaField } from './TextAreaField';

const meta = {
	title: 'Features/Form/Fields/TextAreaField',
	component: TextAreaField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof TextAreaField>;

export default meta;
type Story = StoryObj<typeof TextAreaField>;

const TextAreaFieldWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <TextAreaField {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: TextAreaFieldWrapper,
	args: {
		label: 'Description',
		placeholder: 'Enter a description...',
		rows: 4,
	},
};
export const WithValue: Story = {
	render: TextAreaFieldWrapper,
	args: {
		label: 'Notes',
		value: 'This is a sample note with multiple lines.\nIt demonstrates the TextAreaField component.',
		rows: 6,
		required: true,
	},
};
export const TallTextArea: Story = {
	render: TextAreaFieldWrapper,
	args: {
		label: 'Long Text',
		placeholder: 'Enter your story...',
		rows: 10,
	},
};
export const WithError: Story = {
	render: TextAreaFieldWrapper,
	args: {
		label: 'Comment',
		placeholder: 'Enter your comment',
		error: 'Comment must be at least 10 characters',
		required: true,
		rows: 4,
	},
};
export const Required: Story = {
	render: TextAreaFieldWrapper,
	args: {
		label: 'Bio',
		placeholder: 'Tell us about yourself...',
		required: true,
		rows: 5,
	},
};
