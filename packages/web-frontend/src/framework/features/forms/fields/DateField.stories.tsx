import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { DateField } from './DateField';

const meta = {
	title: 'Features/Form/Fields/DateField',
	component: DateField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof DateField>;

const DateFieldWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <DateField {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: DateFieldWrapper,
	args: {
		label: 'Birth Date',
	},
};
export const WithValue: Story = {
	render: DateFieldWrapper,
	args: {
		label: 'Registration Date',
		value: '2024-01-15',
	},
};
export const WithMinMax: Story = {
	render: DateFieldWrapper,
	args: {
		label: 'Appointment Date',
		min: '2024-01-01',
		max: '2024-12-31',
		required: true,
	},
};
export const WithError: Story = {
	render: DateFieldWrapper,
	args: {
		label: 'Event Date',
		error: 'Date must be in the future',
		required: true,
	},
};
export const Required: Story = {
	render: DateFieldWrapper,
	args: {
		label: 'Start Date',
		required: true,
	},
};
export const Disabled: Story = {
	render: DateFieldWrapper,
	args: {
		label: 'Birth Date',
		value: '1990-01-01',
		disabled: true,
	},
};
