import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SelectInput } from './SelectInput';

const meta = {
	title: 'Features/Form/Inputs/SelectInput',
	component: SelectInput,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof SelectInput>;

export default meta;
type Story = StoryObj<typeof SelectInput>;

const countries = [
	{ value: 'us', label: 'United States' },
	{ value: 'uk', label: 'United Kingdom' },
	{ value: 'ca', label: 'Canada' },
	{ value: 'au', label: 'Australia' },
];

const SelectInputWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <SelectInput {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: SelectInputWrapper,
	args: {
		options: countries,
	},
};
export const WithPlaceholder: Story = {
	render: SelectInputWrapper,
	args: {
		options: countries,
		placeholder: 'Select a country',
	},
};
export const WithValue: Story = {
	render: SelectInputWrapper,
	args: {
		options: countries,
		value: 'uk',
	},
};
export const Disabled: Story = {
	render: SelectInputWrapper,
	args: {
		options: countries,
		value: 'us',
		disabled: true,
	},
};
