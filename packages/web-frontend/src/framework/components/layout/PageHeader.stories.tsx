import { Button } from '@framework/components/primitives/Button';
import type { Meta, StoryObj } from '@storybook/react';

import { PageHeader } from './PageHeader';

const meta = {
	title: 'UI/PageHeader',
	component: PageHeader,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		title: {
			control: 'text',
			description: 'Page title text',
		},
		badge: {
			control: 'text',
			description: 'Optional count badge (number or string)',
		},
		action: {
			control: false,
			description: 'Optional action button(s) or other elements',
		},
		className: {
			control: 'text',
			description: 'Additional CSS classes',
		},
	},
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Simple page header with just a title
 */
export const Default: Story = {
	args: {
		title: 'Page Title',
	},
};

/**
 * Page header with a count badge
 */
export const WithBadge: Story = {
	args: {
		title: 'Books',
		badge: 42,
	},
};

/**
 * Page header with badge showing zero
 */
export const WithZeroBadge: Story = {
	args: {
		title: 'Empty Collection',
		badge: 0,
	},
};

/**
 * Page header with string badge (e.g., for large numbers)
 */
export const WithStringBadge: Story = {
	args: {
		title: 'Popular Items',
		badge: '1000+',
	},
};

/**
 * Page header with action button
 */
export const WithAction: Story = {
	args: {
		title: 'Dashboard',
		action: <Button>Add Item</Button>,
	},
};

/**
 * Complete example with title, badge, and action
 */
export const Complete: Story = {
	args: {
		title: 'Books',
		badge: 150,
		action: <Button>Add Book</Button>,
	},
};

/**
 * Real-world example matching BooksPage
 */
export const BooksPageExample: Story = {
	args: {
		title: 'Books',
		badge: 247,
		action: <Button>Add Book</Button>,
	},
};

/**
 * Real-world example matching IngredientsPage
 */
export const IngredientsPageExample: Story = {
	args: {
		title: 'Ingredients',
		badge: 89,
		action: <Button>Add Ingredient</Button>,
	},
};

/**
 * Multiple action buttons
 */
export const WithMultipleActions: Story = {
	args: {
		title: 'Products',
		badge: 523,
		action: (
			<>
				<Button variant="outline">Export</Button>
				<Button>Add Product</Button>
			</>
		),
	},
};

/**
 * With custom className
 */
export const WithCustomClass: Story = {
	args: {
		title: 'Settings',
		className: 'border-b pb-4',
	},
};

/**
 * Long title example
 */
export const LongTitle: Story = {
	args: {
		title: 'Very Long Page Title That Demonstrates Text Wrapping Behavior',
		badge: 9999,
		action: <Button>Action</Button>,
	},
};
