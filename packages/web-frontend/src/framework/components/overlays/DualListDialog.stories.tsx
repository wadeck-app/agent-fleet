import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ArrowLeft, ArrowRight, Folder } from 'lucide-react';

import { Badge } from '../primitives/Badge';
import { DualListDialog, type ItemActions } from './DualListDialog';
import { DualListItem } from './DualListItem';

interface StoryItem {
	id: string;
	name: string;
	count?: number;
	color?: string;
}

const meta: Meta<typeof DualListDialog<StoryItem, StoryItem>> = {
	title: 'Framework/Components/Overlays/DualListDialog',
	component: DualListDialog,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Example data
const leftItemsData: StoryItem[] = [
	{ id: '1', name: 'Associated Item 1', count: 5, color: '#3b82f6' },
	{ id: '2', name: 'Associated Item 2', count: 8, color: '#ef4444' },
	{ id: '3', name: 'Associated Item 3', count: 12, color: '#10b981' },
];

const rightItemsData: StoryItem[] = [
	{ id: '4', name: 'Available Item 1', count: 3, color: '#f59e0b' },
	{ id: '5', name: 'Available Item 2', count: 7, color: '#8b5cf6' },
	{ id: '6', name: 'Available Item 3', count: 15, color: '#ec4899' },
	{ id: '7', name: 'Available Item 4', count: 2, color: '#14b8a6' },
];

export const Default: Story = {
	args: {
		open: true,
		onOpenChange: fn(),
		title: 'Manage Items',
		leftTitle: 'Associated Items',
		leftItems: leftItemsData,
		leftItemKey: (item: StoryItem) => item.id,
		leftItemRenderer: (item: StoryItem, actions: ItemActions) => (
			<DualListItem
				itemId={item.id}
				variant="sortable"
				icon={
					<div
						className="h-3 w-3 rounded-full border border-border"
						style={{ backgroundColor: item.color }}
					/>
				}
				label={item.name}
				badge={
					<Badge variant="secondary" className="text-xs">
						{item.count}
					</Badge>
				}
				onAction={fn()}
				actionIcon={ArrowRight}
				actionLabel={`Remove ${item.name}`}
				isLoading={actions.isLoading}
				isReordering={actions.isReordering}
			/>
		),
		leftHelpText: 'Drag to reorder, click → to remove',
		onReorder: fn(),
		rightTitle: 'Available Items',
		rightItems: rightItemsData,
		rightItemKey: (item: StoryItem) => item.id,
		rightItemRenderer: (item: StoryItem, actions: ItemActions) => (
			<DualListItem
				itemId={item.id}
				variant="available"
				icon={
					<div
						className="h-3 w-3 rounded-full border border-border"
						style={{ backgroundColor: item.color }}
					/>
				}
				label={item.name}
				badge={
					<Badge variant="secondary" className="text-xs">
						{item.count}
					</Badge>
				}
				onAction={fn()}
				actionIcon={ArrowLeft}
				actionLabel={`Add ${item.name}`}
				isLoading={actions.isLoading}
			/>
		),
		rightHelpText: 'Click ← to add',
		searchPlaceholder: 'Search items...',
		searchFilter: (item: StoryItem, query: string) => item.name.toLowerCase().includes(query.toLowerCase()),
	},
};

export const EmptyLeft: Story = {
	args: {
		...Default.args,
		leftItems: [],
	},
};

export const EmptyRight: Story = {
	args: {
		...Default.args,
		rightItems: [],
	},
};

export const CustomEmptyStates: Story = {
	args: {
		...Default.args,
		leftItems: [],
		rightItems: [],
		leftEmptyState: (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<div className="mb-2 text-4xl">🎯</div>
				<p className="text-sm font-semibold text-muted-foreground">No associated items</p>
				<p className="text-xs text-muted-foreground">Start by adding items from the right</p>
			</div>
		),
		rightEmptyState: (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<div className="mb-2 text-4xl">🎉</div>
				<p className="text-sm font-semibold text-muted-foreground">All done!</p>
				<p className="text-xs text-muted-foreground">Everything has been associated</p>
			</div>
		),
	},
};

export const WithLoadingStates: Story = {
	args: {
		...Default.args,
		loadingItems: new Set(['1', '4']),
	},
};

export const WithReorderingStates: Story = {
	args: {
		...Default.args,
		reorderingItems: new Set(['2', '3']),
	},
};

export const WithIcons: Story = {
	args: {
		...Default.args,
		leftItemRenderer: (item: StoryItem, actions: ItemActions) => (
			<DualListItem
				itemId={item.id}
				variant="sortable"
				icon={<Folder className="h-4 w-4" style={{ color: item.color }} />}
				label={item.name}
				badge={
					<Badge variant="secondary" className="text-xs">
						{item.count}
					</Badge>
				}
				onAction={fn()}
				actionIcon={ArrowRight}
				actionLabel={`Remove ${item.name}`}
				isLoading={actions.isLoading}
				isReordering={actions.isReordering}
			/>
		),
		rightItemRenderer: (item: StoryItem, actions: ItemActions) => (
			<DualListItem
				itemId={item.id}
				variant="available"
				icon={<Folder className="h-4 w-4" style={{ color: item.color }} />}
				label={item.name}
				badge={
					<Badge variant="secondary" className="text-xs">
						{item.count}
					</Badge>
				}
				onAction={fn()}
				actionIcon={ArrowLeft}
				actionLabel={`Add ${item.name}`}
				isLoading={actions.isLoading}
			/>
		),
	},
};

export const LargeWidth: Story = {
	args: {
		...Default.args,
		maxWidth: '5xl',
	},
};

// Interactive story demonstrating state management
export const Interactive: Story = {
	render: function InteractiveRender() {
		const [open, setOpen] = useState(true);
		const [leftItems, setLeftItems] = useState<StoryItem[]>(leftItemsData);
		const [rightItems, setRightItems] = useState<StoryItem[]>(rightItemsData);
		const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

		const handleAdd = async (itemId: string) => {
			setLoadingItems(prev => new Set(prev).add(itemId));

			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 500));

			const item = rightItems.find(i => i.id === itemId);
			if (item) {
				setRightItems(prev => prev.filter(i => i.id !== itemId));
				setLeftItems(prev => [...prev, item]);
			}

			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		};

		const handleRemove = async (itemId: string) => {
			setLoadingItems(prev => new Set(prev).add(itemId));

			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 500));

			const item = leftItems.find(i => i.id === itemId);
			if (item) {
				setLeftItems(prev => prev.filter(i => i.id !== itemId));
				setRightItems(prev => [...prev, item]);
			}

			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		};

		const handleReorder = async (activeId: string, overId: string) => {
			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 300));

			const activeIndex = leftItems.findIndex(i => i.id === activeId);
			const overIndex = leftItems.findIndex(i => i.id === overId);

			if (activeIndex !== -1 && overIndex !== -1) {
				const newItems = [...leftItems];
				const [removed] = newItems.splice(activeIndex, 1);
				newItems.splice(overIndex, 0, removed);
				setLeftItems(newItems);
			}
		};

		return (
			<>
				<button onClick={() => setOpen(true)} className="rounded bg-blue-500 px-4 py-2 text-white">
					Open Dialog
				</button>

				<DualListDialog
					open={open}
					onOpenChange={setOpen}
					title="Interactive Demo"
					leftTitle="Associated Items"
					leftItems={leftItems}
					leftItemKey={(item: StoryItem) => item.id}
					leftItemRenderer={(item: StoryItem, actions) => (
						<DualListItem
							itemId={item.id}
							variant="sortable"
							icon={
								<div
									className="h-3 w-3 rounded-full border border-border"
									style={{ backgroundColor: item.color }}
								/>
							}
							label={item.name}
							badge={
								<Badge variant="secondary" className="text-xs">
									{item.count}
								</Badge>
							}
							onAction={handleRemove}
							actionIcon={ArrowRight}
							actionLabel={`Remove ${item.name}`}
							isLoading={actions.isLoading}
							isReordering={actions.isReordering}
						/>
					)}
					leftHelpText="Drag to reorder, click → to remove"
					onReorder={handleReorder}
					rightTitle="Available Items"
					rightItems={rightItems}
					rightItemKey={(item: StoryItem) => item.id}
					rightItemRenderer={(item: StoryItem, actions) => (
						<DualListItem
							itemId={item.id}
							variant="available"
							icon={
								<div
									className="h-3 w-3 rounded-full border border-border"
									style={{ backgroundColor: item.color }}
								/>
							}
							label={item.name}
							badge={
								<Badge variant="secondary" className="text-xs">
									{item.count}
								</Badge>
							}
							onAction={handleAdd}
							actionIcon={ArrowLeft}
							actionLabel={`Add ${item.name}`}
							isLoading={actions.isLoading}
						/>
					)}
					rightHelpText="Click ← to add"
					searchPlaceholder="Search items..."
					searchFilter={(item: StoryItem, query: string) =>
						item.name.toLowerCase().includes(query.toLowerCase())
					}
					loadingItems={loadingItems}
				/>
			</>
		);
	},
};
