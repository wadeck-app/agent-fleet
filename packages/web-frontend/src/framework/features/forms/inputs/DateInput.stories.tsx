import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { DateInput } from './DateInput';

const meta = {
	title: 'Features/Form/Inputs/DateInput',
	component: DateInput,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof DateInput>;

export default meta;
type Story = StoryObj<typeof DateInput>;

const DateInputWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <DateInput {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	args: undefined as any,
	render: DateInputWrapper,
};
export const WithValue: Story = {
	render: DateInputWrapper,
	args: {
		value: '2024-01-15',
	},
};
export const WithMinMax: Story = {
	render: DateInputWrapper,
	args: {
		min: '2024-01-01',
		max: '2024-12-31',
	},
};
export const Disabled: Story = {
	render: DateInputWrapper,
	args: {
		value: '2024-12-25',
		disabled: true,
	},
};
