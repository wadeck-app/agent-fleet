import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ArrowLeft, ArrowRight, Folder } from 'lucide-react';

import { Badge } from '../primitives/Badge';
import { DualListItem } from './DualListItem';

const meta: Meta<typeof DualListItem> = {
	title: 'Framework/Components/Overlays/DualListItem',
	component: DualListItem,
	parameters: {
		layout: 'padded',
	},
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['available', 'sortable'],
			description: 'The variant of the item',
		},
		label: {
			control: 'text',
			description: 'The label text to display',
		},
		isLoading: {
			control: 'boolean',
			description: 'Whether the item is in a loading state',
		},
		isReordering: {
			control: 'boolean',
			description: 'Whether the item is being reordered (sortable only)',
		},
	},
	args: {
		onAction: fn(),
	},
};

export default meta;
type Story = StoryObj<typeof DualListItem>;

// Available variant stories
export const AvailableBasic: Story = {
	args: {
		itemId: 'item-1',
		variant: 'available',
		label: 'My Project',
		actionIcon: ArrowLeft,
		actionLabel: 'Pin project',
	},
};

export const AvailableWithIcon: Story = {
	args: {
		itemId: 'item-2',
		variant: 'available',
		icon: (
			<div
				className="h-3 w-3 rounded-full border border-border"
				style={{ backgroundColor: '#3b82f6' }}
				title="#3b82f6"
			/>
		),
		label: 'Project with Icon',
		actionIcon: ArrowLeft,
		actionLabel: 'Pin project',
	},
};

export const AvailableWithBadge: Story = {
	args: {
		itemId: 'item-3',
		variant: 'available',
		label: 'Workspace with Tasks',
		badge: (
			<Badge variant="secondary" className="text-xs">
				12
			</Badge>
		),
		actionIcon: ArrowLeft,
		actionLabel: 'Associate workspace',
	},
};

export const AvailableWithIconAndBadge: Story = {
	args: {
		itemId: 'item-4',
		variant: 'available',
		icon: <Folder className="h-4 w-4 text-info" />,
		label: 'Complete Example',
		badge: (
			<Badge variant="secondary" className="text-xs">
				5
			</Badge>
		),
		actionIcon: ArrowLeft,
		actionLabel: 'Add item',
	},
};

export const AvailableLoading: Story = {
	args: {
		itemId: 'item-5',
		variant: 'available',
		icon: <Folder className="h-4 w-4 text-info" />,
		label: 'Loading Item',
		badge: (
			<Badge variant="secondary" className="text-xs">
				3
			</Badge>
		),
		actionIcon: ArrowLeft,
		actionLabel: 'Add item',
		isLoading: true,
	},
};

// Sortable variant stories
export const SortableBasic: Story = {
	args: {
		itemId: 'item-6',
		variant: 'sortable',
		label: 'Pinned Project',
		actionIcon: ArrowRight,
		actionLabel: 'Unpin project',
	},
};

export const SortableWithIcon: Story = {
	args: {
		itemId: 'item-7',
		variant: 'sortable',
		icon: (
			<div
				className="h-3 w-3 rounded-full border border-border"
				style={{ backgroundColor: '#ef4444' }}
				title="#ef4444"
			/>
		),
		label: 'Project with Icon',
		actionIcon: ArrowRight,
		actionLabel: 'Unpin project',
	},
};

export const SortableWithBadge: Story = {
	args: {
		itemId: 'item-8',
		variant: 'sortable',
		label: 'Associated Workspace',
		badge: (
			<Badge variant="secondary" className="text-xs">
				8
			</Badge>
		),
		actionIcon: ArrowRight,
		actionLabel: 'Dissociate workspace',
	},
};

export const SortableWithIconAndBadge: Story = {
	args: {
		itemId: 'item-9',
		variant: 'sortable',
		icon: <Folder className="h-4 w-4 text-success" />,
		label: 'Complete Example',
		badge: (
			<Badge variant="secondary" className="text-xs">
				7
			</Badge>
		),
		actionIcon: ArrowRight,
		actionLabel: 'Remove item',
	},
};

export const SortableLoading: Story = {
	args: {
		itemId: 'item-10',
		variant: 'sortable',
		icon: <Folder className="h-4 w-4 text-success" />,
		label: 'Loading Item',
		badge: (
			<Badge variant="secondary" className="text-xs">
				4
			</Badge>
		),
		actionIcon: ArrowRight,
		actionLabel: 'Remove item',
		isLoading: true,
	},
};

export const SortableReordering: Story = {
	args: {
		itemId: 'item-11',
		variant: 'sortable',
		icon: <Folder className="h-4 w-4 text-special" />,
		label: 'Reordering Item',
		badge: (
			<Badge variant="secondary" className="text-xs">
				6
			</Badge>
		),
		actionIcon: ArrowRight,
		actionLabel: 'Remove item',
		isReordering: true,
	},
};

// Comparison story showing both variants
export const ComparisonView: Story = {
	render: () => (
		<div className="space-y-4">
			<div>
				<h3 className="mb-2 text-sm font-semibold">Available Variant</h3>
				<div className="space-y-1">
					<DualListItem
						itemId="avail-1"
						variant="available"
						icon={<Folder className="h-4 w-4 text-info" />}
						label="Available Item 1"
						badge={
							<Badge variant="secondary" className="text-xs">
								3
							</Badge>
						}
						actionIcon={ArrowLeft}
						actionLabel="Add"
						onAction={() => console.log('Added')}
					/>
					<DualListItem
						itemId="avail-2"
						variant="available"
						icon={<Folder className="h-4 w-4 text-success" />}
						label="Available Item 2"
						badge={
							<Badge variant="secondary" className="text-xs">
								7
							</Badge>
						}
						actionIcon={ArrowLeft}
						actionLabel="Add"
						onAction={() => console.log('Added')}
					/>
				</div>
			</div>

			<div>
				<h3 className="mb-2 text-sm font-semibold">Sortable Variant</h3>
				<div className="space-y-1">
					<DualListItem
						itemId="sort-1"
						variant="sortable"
						icon={<Folder className="h-4 w-4 text-danger" />}
						label="Sortable Item 1"
						badge={
							<Badge variant="secondary" className="text-xs">
								5
							</Badge>
						}
						actionIcon={ArrowRight}
						actionLabel="Remove"
						onAction={() => console.log('Removed')}
					/>
					<DualListItem
						itemId="sort-2"
						variant="sortable"
						icon={<Folder className="h-4 w-4 text-special" />}
						label="Sortable Item 2"
						badge={
							<Badge variant="secondary" className="text-xs">
								12
							</Badge>
						}
						actionIcon={ArrowRight}
						actionLabel="Remove"
						onAction={() => console.log('Removed')}
					/>
				</div>
			</div>
		</div>
	),
};
