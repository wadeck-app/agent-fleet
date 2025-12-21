import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { IntegerField } from './IntegerField';

const meta = {
	title: 'Features/Form/Fields/IntegerField',
	component: IntegerField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof IntegerField>;

export default meta;
type Story = StoryObj<typeof IntegerField>;

const IntegerFieldWrapper = (args: any) => {
	const [value, setValue] = useState(args.value ?? 0);
	return <IntegerField {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: IntegerFieldWrapper,
	args: {
		label: 'Quantity',
		placeholder: '0',
	},
};
export const WithValue: Story = {
	render: IntegerFieldWrapper,
	args: {
		label: 'Pages',
		value: 350,
	},
};
export const WithError: Story = {
	render: IntegerFieldWrapper,
	args: {
		label: 'Pages',
		value: -1,
		error: 'Pages must be a positive number',
		required: true,
	},
};
export const WithMinMax: Story = {
	render: IntegerFieldWrapper,
	args: {
		label: 'Rating',
		min: 1,
		max: 5,
		value: 3,
	},
};
export const Required: Story = {
	render: IntegerFieldWrapper,
	args: {
		label: 'Year',
		required: true,
		placeholder: 'e.g., 2024',
	},
};
