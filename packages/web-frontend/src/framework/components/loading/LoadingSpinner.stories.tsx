import type { Meta, StoryObj } from '@storybook/react';

import { LoadingSpinner } from './LoadingSpinner';

/**
 * LoadingSpinner component stories demonstrating all sizes and configurations.
 * Pure presentation component for showing loading states.
 */
const meta = {
	title: 'UI/LoadingSpinner',
	component: LoadingSpinner,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		size: {
			control: 'select',
			options: ['sm', 'md', 'lg'],
			description: 'Spinner size',
		},
		message: {
			control: 'text',
			description: 'Loading message displayed below spinner',
		},
	},
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default loading spinner
export const Default: Story = {
	args: {
		size: 'md',
		message: 'Loading...',
	},
};

// Small spinner
export const Small: Story = {
	args: {
		size: 'sm',
		message: 'Loading...',
	},
};

// Medium spinner (default)
export const Medium: Story = {
	args: {
		size: 'md',
		message: 'Loading...',
	},
};

// Large spinner
export const Large: Story = {
	args: {
		size: 'lg',
		message: 'Loading...',
	},
};

// No message
export const NoMessage: Story = {
	args: {
		size: 'md',
		message: '',
	},
};

// Custom message
export const CustomMessage: Story = {
	args: {
		size: 'md',
		message: 'Fetching your data...',
	},
};

// All sizes showcase
export const AllSizes: Story = {
	render: () => (
		<div className="flex items-start gap-8">
			<div>
				<LoadingSpinner size="sm" message="Small" />
			</div>
			<div>
				<LoadingSpinner size="md" message="Medium" />
			</div>
			<div>
				<LoadingSpinner size="lg" message="Large" />
			</div>
		</div>
	),
};

// In context - card loading
export const InCard: Story = {
	render: () => (
		<div className="w-96 rounded-lg border border-border bg-card p-6">
			<h3 className="mb-4 text-lg font-semibold">User Profile</h3>
			<LoadingSpinner size="md" message="Loading profile data..." />
		</div>
	),
};

// In context - full page loading
export const FullPage: Story = {
	render: () => (
		<div className="flex min-h-[400px] items-center justify-center bg-background">
			<LoadingSpinner size="lg" message="Loading application..." />
		</div>
	),
};
