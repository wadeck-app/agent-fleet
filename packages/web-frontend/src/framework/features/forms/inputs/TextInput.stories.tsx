import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { TextInput } from './TextInput';

const meta = {
	title: 'Features/Form/Inputs/TextInput',
	component: TextInput,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof TextInput>;

const TextInputWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <TextInput {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: TextInputWrapper,
	args: {
		placeholder: 'Enter text...',
	},
};
export const Email: Story = {
	render: TextInputWrapper,
	args: {
		type: 'email',
		placeholder: 'you@example.com',
	},
};
export const Password: Story = {
	render: TextInputWrapper,
	args: {
		type: 'password',
		placeholder: '••••••••',
	},
};
export const Disabled: Story = {
	render: TextInputWrapper,
	args: {
		value: 'Disabled input',
		disabled: true,
	},
};
export const WithValue: Story = {
	render: TextInputWrapper,
	args: {
		value: 'Hello World',
	},
};
