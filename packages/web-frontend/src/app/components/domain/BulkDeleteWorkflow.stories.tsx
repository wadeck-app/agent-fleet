import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { FailedDeletion } from '@shared/api/books.contract';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from '@storybook/test';

import { BulkDeleteWorkflow } from './BulkDeleteWorkflow';

/**
 * ===========================================================================================
 * BULK DELETE WORKFLOW STORIES
 * ===========================================================================================
 *
 * Demonstrates the BulkDeleteWorkflow component in various states:
 * - Dialog closed/open states
 * - Different item counts
 * - Success/failure scenarios
 * - Batch processing
 * - Different item types
 *
 * Interactive tests verify the deletion workflow behavior.
 *
 * ===========================================================================================
 */

const meta: Meta<typeof BulkDeleteWorkflow> = {
	title: 'Domain/BulkDeleteWorkflow',
	component: BulkDeleteWorkflow,
	parameters: {
		layout: 'centered',
		docs: {
			description: {
				component:
					'A reusable component for managing bulk deletion workflows with confirmation dialog, batch processing, and progress feedback.',
			},
		},
	},
	tags: ['autodocs'],
	argTypes: {
		open: {
			description: 'Whether the confirmation dialog is open',
			control: 'boolean',
		},
		selectedIds: {
			description: 'Set of IDs to delete',
			control: false,
		},
		itemTypeName: {
			description: 'Name of the item type (e.g., "book", "ingredient")',
			control: 'text',
		},
		batchSize: {
			description: 'Number of items to delete per batch',
			control: 'number',
		},
	},
};

export default meta;
type Story = StoryObj<typeof BulkDeleteWorkflow>;

/**
 * Wrapper component that provides state management and trigger button
 */
function InteractiveWrapper({
	selectedCount = 3,
	itemTypeName = 'book',
	batchSize = 10,
	onBulkDelete,
}: {
	selectedCount?: number;
	itemTypeName?: string;
	batchSize?: number;
	onBulkDelete: (ids: string[]) => Promise<{ deleted: string[]; failed: FailedDeletion[] }>;
}) {
	const [open, setOpen] = useState(false);
	const [selectedIds] = useState(new Set(Array.from({ length: selectedCount }, (_, i) => `item-${i + 1}`)));
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);

	const handleReload = async () => {
		// Simulate reload
		await new Promise(resolve => setTimeout(resolve, 300));
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<div className="rounded-lg border border-border bg-card p-6 text-center">
				<p className="text-sm text-muted-foreground">
					{selectedIds.size} {itemTypeName}(s) selected
				</p>
				{deletingIds.size > 0 && (
					<p className="mt-2 text-sm text-warning">Deleting {deletingIds.size} items...</p>
				)}
				{isBulkDeleting && <p className="mt-2 text-sm text-muted-foreground">Processing...</p>}
			</div>

			<Button onClick={() => setOpen(true)} variant="destructive">
				Delete {selectedIds.size} {itemTypeName}(s)
			</Button>

			<BulkDeleteWorkflow
				open={open}
				onOpenChange={setOpen}
				selectedIds={selectedIds}
				onClear={() => {}}
				onBulkDelete={onBulkDelete}
				onReload={handleReload}
				itemTypeName={itemTypeName}
				batchSize={batchSize}
				onDeletingChange={setDeletingIds}
				onBulkDeletingChange={setIsBulkDeleting}
			/>
		</div>
	);
}

/**
 * Default state with closed dialog
 */
export const Closed: Story = {
	render: () => {
		const selectedIds = new Set(['1', '2', '3']);

		return (
			<div className="flex flex-col items-center gap-4">
				<div className="rounded-lg border border-border bg-card p-6 text-center">
					<p className="text-sm text-muted-foreground">{selectedIds.size} book(s) selected</p>
					<p className="mt-2 text-xs text-muted-foreground">Click button to open dialog</p>
				</div>

				<Button variant="destructive">Delete {selectedIds.size} books</Button>

				<BulkDeleteWorkflow
					open={false}
					onOpenChange={fn()}
					selectedIds={selectedIds}
					onClear={fn()}
					onBulkDelete={fn()}
					onReload={fn()}
					itemTypeName="book"
				/>
			</div>
		);
	},
};

/**
 * Dialog open and ready for confirmation
 */
export const Open: Story = {
	render: () => {
		const selectedIds = new Set(['1', '2', '3']);

		return (
			<div className="flex flex-col items-center gap-4">
				<div className="rounded-lg border border-border bg-card p-6 text-center">
					<p className="text-sm text-muted-foreground">{selectedIds.size} book(s) selected</p>
				</div>

				<BulkDeleteWorkflow
					open={true}
					onOpenChange={fn()}
					selectedIds={selectedIds}
					onClear={fn()}
					onBulkDelete={fn()}
					onReload={fn()}
					itemTypeName="book"
				/>
			</div>
		);
	},
};

/**
 * Single item deletion
 */
export const SingleItem: Story = {
	render: () => {
		const selectedIds = new Set(['item-1']);

		return (
			<BulkDeleteWorkflow
				open={true}
				onOpenChange={fn()}
				selectedIds={selectedIds}
				onClear={fn()}
				onBulkDelete={fn()}
				onReload={fn()}
				itemTypeName="book"
			/>
		);
	},
};

/**
 * Large selection (25 items)
 */
export const LargeSelection: Story = {
	render: () => {
		const selectedIds = new Set(Array.from({ length: 25 }, (_, i) => `item-${i + 1}`));

		return (
			<BulkDeleteWorkflow
				open={true}
				onOpenChange={fn()}
				selectedIds={selectedIds}
				onClear={fn()}
				onBulkDelete={fn()}
				onReload={fn()}
				itemTypeName="book"
			/>
		);
	},
};

/**
 * Different item type (ingredients)
 */
export const DifferentItemType: Story = {
	render: () => {
		const selectedIds = new Set(['ing-1', 'ing-2', 'ing-3', 'ing-4', 'ing-5']);

		return (
			<BulkDeleteWorkflow
				open={true}
				onOpenChange={fn()}
				selectedIds={selectedIds}
				onClear={fn()}
				onBulkDelete={fn()}
				onReload={fn()}
				itemTypeName="ingredient"
			/>
		);
	},
};

/**
 * Interactive: Successful deletion
 */
export const SuccessfulDeletion: Story = {
	render: () => {
		const handleBulkDelete = async (ids: string[]) => {
			// Simulate API delay
			await new Promise(resolve => setTimeout(resolve, 500));
			return {
				deleted: ids,
				failed: [],
			};
		};

		return <InteractiveWrapper selectedCount={5} onBulkDelete={handleBulkDelete} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// Click the delete button
		const deleteButton = canvas.getByRole('button', { name: /Delete 5 book/i });
		await userEvent.click(deleteButton);

		// Wait for dialog to appear
		await waitFor(() => {
			expect(canvas.getByRole('alertdialog')).toBeInTheDocument();
		});

		// Verify dialog content
		expect(canvas.getByText('Delete 5 book(s)?')).toBeInTheDocument();

		// Click confirm
		const confirmButton = canvas.getByRole('button', { name: 'Delete All' });
		await userEvent.click(confirmButton);

		// Dialog should close immediately
		await waitFor(() => {
			expect(canvas.queryByRole('alertdialog')).not.toBeInTheDocument();
		});
	},
};

/**
 * Interactive: Partial failure
 */
export const PartialFailure: Story = {
	render: () => {
		const handleBulkDelete = async (ids: string[]) => {
			await new Promise(resolve => setTimeout(resolve, 500));
			// Simulate some items failing
			const deleted = ids.slice(0, Math.floor(ids.length / 2));
			const failed: FailedDeletion[] = ids.slice(Math.floor(ids.length / 2)).map(id => ({
				id,
				reason: 'Item is in use',
				code: 'IN_USE',
			}));
			return { deleted, failed };
		};

		return <InteractiveWrapper selectedCount={6} onBulkDelete={handleBulkDelete} />;
	},
};

/**
 * Interactive: Complete failure
 */
export const CompleteFailure: Story = {
	render: () => {
		const handleBulkDelete = async (ids: string[]) => {
			await new Promise(resolve => setTimeout(resolve, 500));
			const failed: FailedDeletion[] = ids.map(id => ({
				id,
				reason: 'Item not found',
				code: 'NOT_FOUND',
			}));
			return { deleted: [], failed };
		};

		return <InteractiveWrapper selectedCount={4} onBulkDelete={handleBulkDelete} />;
	},
};

/**
 * Interactive: Batch processing with custom batch size
 */
export const BatchProcessing: Story = {
	render: () => {
		const handleBulkDelete = async (ids: string[]) => {
			// Simulate longer processing for batches
			await new Promise(resolve => setTimeout(resolve, 800));
			return { deleted: ids, failed: [] };
		};

		return <InteractiveWrapper selectedCount={15} batchSize={5} onBulkDelete={handleBulkDelete} />;
	},
	parameters: {
		docs: {
			description: {
				story: 'Demonstrates batch processing with 15 items split into 3 batches of 5 items each.',
			},
		},
	},
};

/**
 * Interactive: Cancel deletion
 */
export const CancelDeletion: Story = {
	render: () => {
		const handleBulkDelete = fn(async (ids: string[]) => {
			await new Promise(resolve => setTimeout(resolve, 500));
			return { deleted: ids, failed: [] };
		});

		return <InteractiveWrapper selectedCount={3} onBulkDelete={handleBulkDelete} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// Click the delete button
		const deleteButton = canvas.getByRole('button', { name: /Delete 3 book/i });
		await userEvent.click(deleteButton);

		// Wait for dialog to appear
		await waitFor(() => {
			expect(canvas.getByRole('alertdialog')).toBeInTheDocument();
		});

		// Click cancel
		const cancelButton = canvas.getByRole('button', { name: 'Cancel' });
		await userEvent.click(cancelButton);

		// Dialog should close
		await waitFor(() => {
			expect(canvas.queryByRole('alertdialog')).not.toBeInTheDocument();
		});

		// Delete should not have been called (we can't check this in Storybook easily)
	},
};

/**
 * Interactive: Network error
 */
export const NetworkError: Story = {
	render: () => {
		const handleBulkDelete = async () => {
			await new Promise(resolve => setTimeout(resolve, 500));
			throw new Error('Network connection failed');
		};

		return <InteractiveWrapper selectedCount={3} onBulkDelete={handleBulkDelete} />;
	},
};
