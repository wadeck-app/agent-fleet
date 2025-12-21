import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { TextField } from './TextField';

const meta = {
	title: 'Features/Form/Fields/TextField',
	component: TextField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof TextField>;

const TextFieldWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <TextField {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: TextFieldWrapper,
	args: {
		label: 'Full Name',
		placeholder: 'Enter your full name',
	},
};
export const Required: Story = {
	render: TextFieldWrapper,
	args: {
		label: 'Email Address',
		type: 'email',
		placeholder: 'you@example.com',
		required: true,
	},
};
export const WithError: Story = {
	render: TextFieldWrapper,
	args: {
		label: 'Email Address',
		type: 'email',
		value: 'invalid-email',
		placeholder: 'you@example.com',
		required: true,
		error: 'Please enter a valid email address',
	},
};
export const Password: Story = {
	render: TextFieldWrapper,
	args: {
		label: 'Password',
		type: 'password',
		placeholder: '••••••••',
		required: true,
	},
};
export const Disabled: Story = {
	render: TextFieldWrapper,
	args: {
		label: 'Username',
		value: 'john_doe',
		disabled: true,
	},
};
