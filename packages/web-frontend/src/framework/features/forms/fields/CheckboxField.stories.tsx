import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { CheckboxField } from './CheckboxField';

const meta = {
	title: 'Features/Form/Fields/CheckboxField',
	component: CheckboxField,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof CheckboxField>;

export default meta;
type Story = StoryObj<typeof CheckboxField>;

const CheckboxFieldWrapper = (args: any) => {
	const [checked, setChecked] = useState(args.checked || false);
	return <CheckboxField {...args} checked={checked} onChange={setChecked} />;
};
export const Default: Story = {
	render: CheckboxFieldWrapper,
	args: {
		label: 'I agree to the terms and conditions',
	},
};
export const Checked: Story = {
	render: CheckboxFieldWrapper,
	args: {
		label: 'Subscribe to newsletter',
		checked: true,
	},
};
export const Required: Story = {
	render: CheckboxFieldWrapper,
	args: {
		label: 'I accept the privacy policy',
		required: true,
	},
};
export const WithError: Story = {
	render: CheckboxFieldWrapper,
	args: {
		label: 'I accept the terms',
		error: 'You must accept the terms to continue',
		required: true,
	},
};
export const Disabled: Story = {
	render: CheckboxFieldWrapper,
	args: {
		label: 'This option is disabled',
		disabled: true,
	},
};
export const CheckedDisabled: Story = {
	render: CheckboxFieldWrapper,
	args: {
		label: 'This option is checked and disabled',
		checked: true,
		disabled: true,
	},
};
