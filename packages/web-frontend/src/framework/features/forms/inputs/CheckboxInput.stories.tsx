import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { CheckboxInput } from './CheckboxInput';

const meta = {
	title: 'Features/Form/Inputs/CheckboxInput',
	component: CheckboxInput,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof CheckboxInput>;

export default meta;
type Story = StoryObj<typeof CheckboxInput>;

const CheckboxInputWrapper = (args: any) => {
	const [checked, setChecked] = useState(args.checked || false);
	return <CheckboxInput {...args} checked={checked} onChange={setChecked} />;
};
export const Unchecked: Story = {
	render: CheckboxInputWrapper,
	args: {
		checked: false,
	},
};
export const Checked: Story = {
	render: CheckboxInputWrapper,
	args: {
		checked: true,
	},
};
export const Disabled: Story = {
	render: CheckboxInputWrapper,
	args: {
		checked: false,
		disabled: true,
	},
};
export const CheckedDisabled: Story = {
	render: CheckboxInputWrapper,
	args: {
		checked: true,
		disabled: true,
	},
};
