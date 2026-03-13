import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Textarea } from './Textarea';

const meta = {
	title: 'Components/Forms/Textarea',
	component: Textarea,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof Textarea>;

const TextareaWrapper = (args: any) => {
	const [value, setValue] = useState(args.value || '');
	return <Textarea {...args} value={value} onChange={e => setValue(e.target.value)} />;
};

export const Default: Story = {
	render: TextareaWrapper,
	args: {
		placeholder: 'Enter description...',
		rows: 5,
	},
};

export const WithValue: Story = {
	render: TextareaWrapper,
	args: {
		value: 'This is a multi-line text area\nwith some content\nthat spans multiple lines.',
		placeholder: 'Enter description...',
		rows: 5,
	},
};

/**
 * Textarea with the dirty state visual indicator (border-primary border-2).
 * This is used in the ticket detail forms to show which fields have been edited.
 */
export const DirtyState: Story = {
	render: TextareaWrapper,
	args: {
		value: 'Modified description\nThis field has been edited by the user.',
		placeholder: 'Enter description...',
		rows: 5,
		className: 'border-primary border-2',
	},
};

export const Disabled: Story = {
	render: TextareaWrapper,
	args: {
		value: 'This textarea is disabled and cannot be edited.',
		disabled: true,
		rows: 5,
	},
};

export const WithError: Story = {
	render: TextareaWrapper,
	args: {
		value: 'Invalid content',
		'aria-invalid': true,
		placeholder: 'Enter description...',
		rows: 5,
	},
};

export const LargeText: Story = {
	render: TextareaWrapper,
	args: {
		value: 'This is a longer text to demonstrate how the textarea handles more content.\n\nIt includes multiple paragraphs and line breaks to show the vertical scrolling behavior when the content exceeds the initial height.\n\nYou can continue typing and the textarea will expand or scroll as needed.',
		placeholder: 'Enter description...',
		rows: 10,
	},
};
