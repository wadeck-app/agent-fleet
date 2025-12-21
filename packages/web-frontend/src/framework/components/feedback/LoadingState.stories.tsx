import type { Meta, StoryObj } from '@storybook/react';

import { LoadingState } from './LoadingState';

/**
 * LoadingState component stories demonstrating various loading state patterns.
 * Pure presentation component for showing loading states with optional messages.
 */
const meta = {
	title: 'UI/LoadingState',
	component: LoadingState,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		message: {
			control: 'text',
			description: 'Optional loading message to display',
		},
		size: {
			control: 'select',
			options: ['small', 'medium', 'large'],
			description: 'Size of the loading dots',
		},
		className: {
			control: 'text',
			description: 'Additional CSS classes',
		},
	},
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default loading state
export const Default: Story = {
	args: {
		message: 'Loading...',
		size: 'large',
	},
};

// Small size
export const Small: Story = {
	args: {
		message: 'Loading...',
		size: 'small',
	},
};

// Medium size
export const Medium: Story = {
	args: {
		message: 'Loading...',
		size: 'medium',
	},
};

// Large size
export const Large: Story = {
	args: {
		message: 'Loading...',
		size: 'large',
	},
};

// Loading ingredients
export const LoadingIngredients: Story = {
	args: {
		message: 'Loading ingredients...',
		size: 'large',
	},
};

// Loading books
export const LoadingBooks: Story = {
	args: {
		message: 'Loading books...',
		size: 'large',
	},
};

// Loading data
export const LoadingData: Story = {
	args: {
		message: 'Loading your data, please wait...',
		size: 'large',
	},
};

// Without message
export const WithoutMessage: Story = {
	args: {
		message: '',
		size: 'large',
	},
};

// In card context
export const InCard: Story = {
	args: undefined as any,
	render: () => (
		<div className="w-full max-w-2xl rounded-lg border border-border bg-card">
			<div className="border-b border-border p-4">
				<h2 className="text-xl font-semibold">Data Table</h2>
			</div>
			<LoadingState message="Loading table data..." size="large" />
		</div>
	),
};

// Full page loading
export const FullPage: Story = {
	args: undefined as any,
	render: () => (
		<div className="min-h-screen w-full bg-background">
			<LoadingState message="Loading application..." size="large" />
		</div>
	),
};

// Multiple loading states
export const Comparison: Story = {
	args: undefined as any,
	render: () => (
		<div
			className={`
    grid gap-6
    md:grid-cols-3
  `}
		>
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-4 text-center font-semibold">Small</h3>
				<LoadingState message="Loading..." size="small" />
			</div>
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-4 text-center font-semibold">Medium</h3>
				<LoadingState message="Loading..." size="medium" />
			</div>
			<div className="rounded-lg border border-border bg-card p-4">
				<h3 className="mb-4 text-center font-semibold">Large</h3>
				<LoadingState message="Loading..." size="large" />
			</div>
		</div>
	),
};

// In list context
export const InList: Story = {
	args: undefined as any,
	render: () => (
		<div className="w-full max-w-4xl space-y-4">
			<div className="rounded-lg border border-border bg-card">
				<div className="border-b border-border p-4">
					<h3 className="font-semibold">Recent Items</h3>
				</div>
				<LoadingState message="Loading items..." size="medium" />
			</div>
		</div>
	),
};
