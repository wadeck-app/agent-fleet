import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';

/**
 * Button component stories demonstrating all variants, sizes, and states.
 * This generic UI component is based on Shadcn/ui patterns with Tailwind styling.
 */
const meta = {
	title: 'UI/Button',
	component: Button,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['primary', 'secondary', 'destructive', 'ghost', 'outline'],
			description: 'Visual style variant',
		},
		size: {
			control: 'select',
			options: ['sm', 'md', 'lg'],
			description: 'Button size',
		},
		disabled: {
			control: 'boolean',
			description: 'Disabled state',
		},
		onClick: { action: 'clicked' },
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default primary button
export const Primary: Story = {
	args: {
		variant: 'default',
		children: 'Primary Button',
	},
};

// Secondary variant
export const Secondary: Story = {
	args: {
		variant: 'secondary',
		children: 'Secondary Button',
	},
};

// Destructive variant for dangerous actions
export const Destructive: Story = {
	args: {
		variant: 'destructive',
		children: 'Delete Item',
	},
};

// Ghost variant for subtle actions
export const Ghost: Story = {
	args: {
		variant: 'ghost',
		children: 'Ghost Button',
	},
};

// Outline variant
export const Outline: Story = {
	args: {
		variant: 'outline',
		children: 'Outline Button',
	},
};

// Small size
export const Small: Story = {
	args: {
		size: 'sm',
		children: 'Small Button',
	},
};

// Medium size (default)
export const Medium: Story = {
	args: {
		size: 'default',
		children: 'Medium Button',
	},
};

// Large size
export const Large: Story = {
	args: {
		size: 'lg',
		children: 'Large Button',
	},
};

// Disabled state
export const Disabled: Story = {
	args: {
		disabled: true,
		children: 'Disabled Button',
	},
};

// All variants showcase
export const AllVariants: Story = {
	args: undefined as any,
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<Button variant="default">Primary</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="destructive">Destructive</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="outline">Outline</Button>
			</div>
			<div className="flex gap-2">
				<Button variant="default" disabled>
					Primary Disabled
				</Button>
				<Button variant="secondary" disabled>
					Secondary Disabled
				</Button>
				<Button variant="destructive" disabled>
					Destructive Disabled
				</Button>
			</div>
		</div>
	),
};

// All sizes showcase
export const AllSizes: Story = {
	args: undefined as any,
	render: () => (
		<div className="flex items-center gap-4">
			<Button size="sm">Small</Button>
			<Button size="default">Medium</Button>
			<Button size="lg">Large</Button>
		</div>
	),
};

// Interactive example
export const Interactive: Story = {
	args: {
		variant: 'default',
		children: 'Click Me!',
	},
	play: async ({ canvasElement: _canvasElement }) => {
		// This would be for interaction testing with @storybook/test
		// We'll keep it simple for now
	},
};
