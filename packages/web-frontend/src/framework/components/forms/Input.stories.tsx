import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Input } from './Input';

const meta = {
	title: 'Components/Forms/Input',
	component: Input,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof Input>;

const InputWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <Input {...args} value={value} onChange={e => setValue(e.target.value)} />;
};

export const Default: Story = {
	render: InputWrapper,
	args: {
		placeholder: 'Enter text...',
	},
};

export const WithValue: Story = {
	render: InputWrapper,
	args: {
		value: 'Example text',
		placeholder: 'Enter text...',
	},
};

/**
 * Input field with the dirty state visual indicator (border-primary border-2).
 * This is used in the ticket detail forms to show which fields have been edited.
 */
export const DirtyState: Story = {
	render: InputWrapper,
	args: {
		value: 'Modified text',
		placeholder: 'Enter text...',
		className: 'border-primary border-2',
	},
};

export const Disabled: Story = {
	render: InputWrapper,
	args: {
		value: 'Disabled input',
		disabled: true,
	},
};

export const WithError: Story = {
	render: InputWrapper,
	args: {
		value: 'Invalid value',
		'aria-invalid': true,
		placeholder: 'Enter text...',
	},
};
