import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SelectField } from './SelectField';

const meta = {
	title: 'Features/Form/Fields/SelectField',
	component: SelectField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof SelectField>;

export default meta;
type Story = StoryObj<typeof SelectField>;

const countries = [
	{ value: 'us', label: 'United States' },
	{ value: 'uk', label: 'United Kingdom' },
	{ value: 'ca', label: 'Canada' },
	{ value: 'au', label: 'Australia' },
];

const genres = [
	{ value: 'fiction', label: 'Fiction' },
	{ value: 'non-fiction', label: 'Non-Fiction' },
	{ value: 'biography', label: 'Biography' },
	{ value: 'science', label: 'Science' },
];

const SelectFieldWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <SelectField {...args} value={value} onChange={setValue} />;
};
export const Default: Story = {
	render: SelectFieldWrapper,
	args: {
		label: 'Country',
		placeholder: 'Select a country',
		options: countries,
	},
};
export const WithValue: Story = {
	render: SelectFieldWrapper,
	args: {
		label: 'Genre',
		value: 'fiction',
		options: genres,
		required: true,
	},
};
export const Required: Story = {
	render: SelectFieldWrapper,
	args: {
		label: 'Country',
		options: countries,
		placeholder: 'Select a country',
		required: true,
	},
};
export const WithError: Story = {
	render: SelectFieldWrapper,
	args: {
		label: 'Genre',
		options: genres,
		placeholder: 'Select a genre',
		error: 'Please select a genre',
		required: true,
	},
};
export const Disabled: Story = {
	render: SelectFieldWrapper,
	args: {
		label: 'Country',
		value: 'us',
		options: countries,
		disabled: true,
	},
};
