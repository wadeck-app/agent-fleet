import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { NumberField } from './NumberField';

const meta = {
	title: 'Features/Form/Fields/NumberField',
	component: NumberField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof NumberField>;

const NumberFieldWrapper = (args: any) => {
	const [value, setValue] = useState(args.value ?? 0);
	return <NumberField {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: NumberFieldWrapper,
	args: {
		label: 'Price',
		placeholder: '0.00',
		step: 0.01,
	},
};
export const WithMinMax: Story = {
	render: NumberFieldWrapper,
	args: {
		label: 'Age',
		min: 0,
		max: 120,
		step: 1,
	},
};
export const Decimal: Story = {
	render: NumberFieldWrapper,
	args: {
		label: 'Weight (kg)',
		step: 0.1,
		placeholder: '0.0',
	},
};
export const WithError: Story = {
	render: NumberFieldWrapper,
	args: {
		label: 'Quantity',
		value: -1,
		error: 'Must be a positive number',
		required: true,
	},
};
export const Required: Story = {
	render: NumberFieldWrapper,
	args: {
		label: 'Amount',
		required: true,
		step: 0.01,
	},
};
