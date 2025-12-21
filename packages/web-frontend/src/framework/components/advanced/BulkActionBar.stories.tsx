import { Button } from '@framework/components/primitives/Button';
import type { Meta, StoryObj } from '@storybook/react';
import { Archive, Download, Trash2 } from 'lucide-react';

import { BulkActionBar } from './BulkActionBar';

/**
 * BulkActionBar displays a floating action bar for bulk operations.
 *
 * ## Features
 * - Two variants: dark (default) and light
 * - Two positions: centered (default) and right
 * - Uses shadcn Button components
 * - Slide-up animation on mount
 */
const meta = {
	title: 'UI/BulkActionBar',
	component: BulkActionBar,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		selectionCount: {
			control: 'number',
			description: 'Number of selected items',
		},
		selectedLabel: {
			control: 'text',
			description: 'Custom label (defaults to "X item(s) selected")',
		},
		variant: {
			control: 'select',
			options: ['dark', 'light'],
			description: 'Visual variant',
		},
		position: {
			control: 'select',
			options: ['centered', 'right'],
			description: 'Position on screen',
		},
	},
} satisfies Meta<typeof BulkActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		selectionCount: 3,
		onCancel: () => alert('Cancel clicked'),
		children: (
			<>
				<Button variant="destructive" size="sm">
					<Trash2 className="mr-2 size-4" />
					Delete
				</Button>
				<Button variant="outline" size="sm">
					<Archive className="mr-2 size-4" />
					Archive
				</Button>
			</>
		),
	},
};

export const LightVariant: Story = {
	args: {
		...Default.args,
		variant: 'light',
	},
};

export const RightPosition: Story = {
	args: {
		...Default.args,
		position: 'right',
	},
};

export const CustomLabel: Story = {
	args: {
		selectionCount: 5,
		selectedLabel: '5 books selected',
		onCancel: () => alert('Cancel clicked'),
		children: (
			<>
				<Button variant="destructive" size="sm">
					Delete Books
				</Button>
				<Button variant="outline" size="sm">
					<Download className="mr-2 size-4" />
					Export
				</Button>
			</>
		),
	},
};

export const SingleItem: Story = {
	args: {
		selectionCount: 1,
		onCancel: () => alert('Cancel clicked'),
		children: (
			<Button variant="destructive" size="sm">
				<Trash2 className="mr-2 size-4" />
				Delete
			</Button>
		),
	},
};

export const ManyActions: Story = {
	args: {
		selectionCount: 12,
		selectedLabel: '12 ingredients selected',
		variant: 'light',
		position: 'centered',
		onCancel: () => alert('Cancel clicked'),
		children: (
			<>
				<Button variant="destructive" size="sm">
					<Trash2 className="mr-2 size-4" />
					Delete
				</Button>
				<Button variant="outline" size="sm">
					<Archive className="mr-2 size-4" />
					Archive
				</Button>
				<Button variant="outline" size="sm">
					<Download className="mr-2 size-4" />
					Export
				</Button>
			</>
		),
	},
};
