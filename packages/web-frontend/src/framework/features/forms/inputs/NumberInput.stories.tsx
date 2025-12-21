import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { NumberInput } from './NumberInput';

const meta = {
	title: 'Features/Form/Inputs/NumberInput',
	component: NumberInput,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof NumberInput>;

export default meta;
type Story = StoryObj<typeof NumberInput>;

const NumberInputWrapper = (args: any) => {
	const [value, setValue] = useState(args.value ?? 0);
	return <NumberInput {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: NumberInputWrapper,
	args: {
		placeholder: '0',
	},
};
export const WithStep: Story = {
	render: NumberInputWrapper,
	args: {
		placeholder: '0.00',
		step: 0.01,
	},
};
export const WithMinMax: Story = {
	render: NumberInputWrapper,
	args: {
		min: 0,
		max: 100,
		value: 50,
	},
};
export const Integer: Story = {
	render: NumberInputWrapper,
	args: {
		step: 1,
		value: 42,
	},
};
export const Disabled: Story = {
	render: NumberInputWrapper,
	args: {
		value: 100,
		disabled: true,
	},
};
