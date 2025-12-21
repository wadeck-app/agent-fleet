import type { Meta, StoryObj } from '@storybook/react';

import { LoadingDots } from './LoadingDots';

const meta = {
	title: 'Components/LoadingDots',
	component: LoadingDots,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		size: {
			control: 'select',
			options: ['small', 'medium', 'large'],
		},
	},
} satisfies Meta<typeof LoadingDots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
	args: {
		size: 'small',
	},
};

export const Medium: Story = {
	args: {
		size: 'medium',
	},
};

export const Large: Story = {
	args: {
		size: 'large',
	},
};

export const WithCustomColor: Story = {
	args: {
		size: 'medium',
		className: 'text-primary',
	},
};

export const OnDarkBackground: Story = {
	args: {
		size: 'medium',
		className: 'text-white',
	},
	parameters: {
		backgrounds: { default: 'dark' },
	},
};
export const AllSizes: Story = {
	args: undefined as any,
	render: () => (
		<div className="flex flex-col items-center gap-6">
			<div className="flex flex-col items-center gap-2">
				<span className="text-sm font-medium">Small</span>
				<LoadingDots size="small" />
			</div>
			<div className="flex flex-col items-center gap-2">
				<span className="text-sm font-medium">Medium</span>
				<LoadingDots size="medium" />
			</div>
			<div className="flex flex-col items-center gap-2">
				<span className="text-sm font-medium">Large</span>
				<LoadingDots size="large" />
			</div>
		</div>
	),
};
