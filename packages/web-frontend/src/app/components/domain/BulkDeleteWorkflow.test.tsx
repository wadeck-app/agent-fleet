import type { FailedDeletion } from '@shared/api/books.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BulkDeleteWorkflow, type BulkDeleteWorkflowProps } from './BulkDeleteWorkflow';

/**
 * ===========================================================================================
 * BULK DELETE WORKFLOW TESTS
 * ===========================================================================================
 *
 * Tests for the BulkDeleteWorkflow component covering:
 * - Dialog display and interactions
 * - Batch processing logic
 * - Success/failure/partial success scenarios
 * - Visual feedback callbacks
 * - Error handling
 * - Edge cases
 *
 * Target: >70% coverage
 *
 * ===========================================================================================
 */

// Mock toast context
const mockShowToast = vi.fn();
vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: mockShowToast }),
}));

describe('BulkDeleteWorkflow', () => {
	const mockOnClear = vi.fn();
	const mockOnBulkDelete = vi.fn();
	const mockOnReload = vi.fn();
	const mockOnDeletingChange = vi.fn();
	const mockOnBulkDeletingChange = vi.fn();
	const mockOnOpenChange = vi.fn();

	const defaultProps: BulkDeleteWorkflowProps = {
		open: false,
		onOpenChange: mockOnOpenChange,
		selectedIds: new Set(['1', '2', '3']),
		onClear: mockOnClear,
		onBulkDelete: mockOnBulkDelete,
		onReload: mockOnReload,
		itemTypeName: 'book',
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockOnBulkDelete.mockResolvedValue({ deleted: [], failed: [] });
		mockOnReload.mockResolvedValue(undefined);
	});

	describe('Dialog Display', () => {
		it('should not render dialog when open is false', () => {
			render(<BulkDeleteWorkflow {...defaultProps} open={false} />);

			expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
		});

		it('should render dialog when open is true', () => {
			render(<BulkDeleteWorkflow {...defaultProps} open={true} />);

			expect(screen.getByRole('alertdialog')).toBeInTheDocument();
			expect(screen.getByText('Delete 3 book(s)?')).toBeInTheDocument();
			expect(
				screen.getByText('This action cannot be undone. 3 book(s) will be permanently deleted.')
			).toBeInTheDocument();
		});

		it('should display correct item count in title and description', () => {
			const selectedIds = new Set(['a', 'b', 'c', 'd', 'e']);
			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} open={true} />);

			expect(screen.getByText('Delete 5 book(s)?')).toBeInTheDocument();
			expect(
				screen.getByText('This action cannot be undone. 5 book(s) will be permanently deleted.')
			).toBeInTheDocument();
		});

		it('should use custom itemTypeName in messages', () => {
			render(<BulkDeleteWorkflow {...defaultProps} itemTypeName="ingredient" open={true} />);

			expect(screen.getByText('Delete 3 ingredient(s)?')).toBeInTheDocument();
			expect(
				screen.getByText('This action cannot be undone. 3 ingredient(s) will be permanently deleted.')
			).toBeInTheDocument();
		});

		it('should have Delete All and Cancel buttons', () => {
			render(<BulkDeleteWorkflow {...defaultProps} open={true} />);

			expect(screen.getByRole('button', { name: 'Delete All' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});
	});

	describe('Dialog Interactions', () => {
		it('should call onOpenChange(false) when Cancel is clicked', async () => {
			const user = userEvent.setup();
			render(<BulkDeleteWorkflow {...defaultProps} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(mockOnOpenChange).toHaveBeenCalledWith(false);
			expect(mockOnClear).not.toHaveBeenCalled();
			expect(mockOnBulkDelete).not.toHaveBeenCalled();
		});

		it('should close dialog on Escape key', async () => {
			const user = userEvent.setup();
			render(<BulkDeleteWorkflow {...defaultProps} open={true} />);

			await user.keyboard('{Escape}');

			expect(mockOnOpenChange).toHaveBeenCalledWith(false);
		});
	});

	describe('Successful Deletion', () => {
		it('should process deletion and show success message for all items', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			mockOnBulkDelete.mockResolvedValue({
				deleted: ['1', '2', '3'],
				failed: [],
			});

			render(
				<BulkDeleteWorkflow
					{...defaultProps}
					selectedIds={selectedIds}
					open={true}
					onDeletingChange={mockOnDeletingChange}
					onBulkDeletingChange={mockOnBulkDeletingChange}
				/>
			);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnDeletingChange).toHaveBeenCalledWith(new Set(['1', '2', '3']));
				expect(mockOnBulkDeletingChange).toHaveBeenCalledWith(true);
			});

			expect(mockOnClear).toHaveBeenCalled();
			expect(mockOnOpenChange).toHaveBeenCalledWith(false);

			await waitFor(() => {
				expect(mockOnBulkDelete).toHaveBeenCalledWith(['1', '2', '3']);
			});

			await waitFor(() => {
				expect(mockOnReload).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(mockOnDeletingChange).toHaveBeenCalledWith(new Set());
				expect(mockOnBulkDeletingChange).toHaveBeenCalledWith(false);
			});

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Successfully deleted 3 book(s)', 'success');
			});
		});

		it('should work without optional callbacks', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			mockOnBulkDelete.mockResolvedValue({
				deleted: ['1', '2', '3'],
				failed: [],
			});

			render(
				<BulkDeleteWorkflow
					{...defaultProps}
					selectedIds={selectedIds}
					open={true}
					// No onDeletingChange or onBulkDeletingChange
				/>
			);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnBulkDelete).toHaveBeenCalled();
				expect(mockOnReload).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Successfully deleted 3 book(s)', 'success');
			});
		});
	});

	describe('Failed Deletion', () => {
		it('should show error message when all items fail', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			const failedDeletions: FailedDeletion[] = [
				{ id: '1', reason: 'Not found', code: 'NOT_FOUND' },
				{ id: '2', reason: 'Not found', code: 'NOT_FOUND' },
				{ id: '3', reason: 'Not found', code: 'NOT_FOUND' },
			];
			mockOnBulkDelete.mockResolvedValue({
				deleted: [],
				failed: failedDeletions,
			});

			render(
				<BulkDeleteWorkflow
					{...defaultProps}
					selectedIds={selectedIds}
					open={true}
					onDeletingChange={mockOnDeletingChange}
					onBulkDeletingChange={mockOnBulkDeletingChange}
				/>
			);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnReload).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(mockOnDeletingChange).toHaveBeenCalledWith(new Set());
				expect(mockOnBulkDeletingChange).toHaveBeenCalledWith(false);
			});

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Failed to delete all 3 book(s)', 'error');
			});
		});

		it('should show warning message for partial success', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			const failedDeletions: FailedDeletion[] = [{ id: '3', reason: 'In use', code: 'IN_USE' }];
			mockOnBulkDelete.mockResolvedValue({
				deleted: ['1', '2'],
				failed: failedDeletions,
			});

			render(
				<BulkDeleteWorkflow
					{...defaultProps}
					selectedIds={selectedIds}
					open={true}
					onDeletingChange={mockOnDeletingChange}
					onBulkDeletingChange={mockOnBulkDeletingChange}
				/>
			);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnReload).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Deleted 2 book(s), 1 failed', 'warning');
			});
		});

		it('should handle network errors gracefully', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			mockOnBulkDelete.mockRejectedValue(new Error('Network error'));

			render(
				<BulkDeleteWorkflow
					{...defaultProps}
					selectedIds={selectedIds}
					open={true}
					onDeletingChange={mockOnDeletingChange}
					onBulkDeletingChange={mockOnBulkDeletingChange}
				/>
			);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnReload).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(mockOnDeletingChange).toHaveBeenCalledWith(new Set());
				expect(mockOnBulkDeletingChange).toHaveBeenCalledWith(false);
			});

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error');
			});
		});
	});

	describe('Batch Processing', () => {
		it('should process items in batches with default batch size of 10', async () => {
			const user = userEvent.setup();
			// Create 25 items (should be 3 batches: 10, 10, 5)
			const selectedIds = new Set(Array.from({ length: 25 }, (_, i) => `item-${i + 1}`));

			mockOnBulkDelete.mockImplementation(async (ids: string[]) => ({
				deleted: ids,
				failed: [],
			}));

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				// Should be called 3 times (3 batches)
				expect(mockOnBulkDelete).toHaveBeenCalledTimes(3);
			});

			// Check batch sizes
			expect(mockOnBulkDelete).toHaveBeenNthCalledWith(
				1,
				expect.arrayContaining(Array.from({ length: 10 }, (_, i) => `item-${i + 1}`))
			);
			expect(mockOnBulkDelete).toHaveBeenNthCalledWith(
				2,
				expect.arrayContaining(Array.from({ length: 10 }, (_, i) => `item-${i + 11}`))
			);
			expect(mockOnBulkDelete).toHaveBeenNthCalledWith(
				3,
				expect.arrayContaining(Array.from({ length: 5 }, (_, i) => `item-${i + 21}`))
			);

			// Check progress toasts
			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Deleting batch 1 of 3 (10 book(s))...', 'info');
				expect(mockShowToast).toHaveBeenCalledWith('Deleting batch 2 of 3 (10 book(s))...', 'info');
				expect(mockShowToast).toHaveBeenCalledWith('Deleting batch 3 of 3 (5 book(s))...', 'info');
			});
		});

		it('should process items with custom batch size', async () => {
			const user = userEvent.setup();
			// Create 15 items with batch size 5 (should be 3 batches: 5, 5, 5)
			const selectedIds = new Set(Array.from({ length: 15 }, (_, i) => `item-${i + 1}`));

			mockOnBulkDelete.mockImplementation(async (ids: string[]) => ({
				deleted: ids,
				failed: [],
			}));

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} batchSize={5} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnBulkDelete).toHaveBeenCalledTimes(3);
			});

			// Check that each batch has 5 items
			expect(mockOnBulkDelete).toHaveBeenNthCalledWith(1, expect.any(Array));
			expect(mockOnBulkDelete.mock.calls[0]![0]).toHaveLength(5);
			expect(mockOnBulkDelete.mock.calls[1]![0]).toHaveLength(5);
			expect(mockOnBulkDelete.mock.calls[2]![0]).toHaveLength(5);

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Deleting batch 1 of 3 (5 book(s))...', 'info');
				expect(mockShowToast).toHaveBeenCalledWith('Deleting batch 2 of 3 (5 book(s))...', 'info');
				expect(mockShowToast).toHaveBeenCalledWith('Deleting batch 3 of 3 (5 book(s))...', 'info');
			});
		});

		it('should accumulate results from multiple batches', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3', '4', '5']);

			// First batch: 3 items (using batchSize=3)
			// Second batch: 2 items
			mockOnBulkDelete
				.mockResolvedValueOnce({
					deleted: ['1', '2'],
					failed: [{ id: '3', reason: 'Error', code: 'ERROR' }],
				})
				.mockResolvedValueOnce({
					deleted: ['4'],
					failed: [{ id: '5', reason: 'Error', code: 'ERROR' }],
				});

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} batchSize={3} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnBulkDelete).toHaveBeenCalledTimes(2);
			});

			// Check accumulated results (3 deleted, 2 failed)
			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Deleted 3 book(s), 2 failed', 'warning');
			});
		});

		it('should process batches sequentially, not in parallel', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3', '4', '5', '6']);
			const callOrder: number[] = [];

			mockOnBulkDelete.mockImplementation(async (ids: string[]) => {
				callOrder.push(ids.length);
				// Add delay to ensure sequential processing
				await new Promise(resolve => setTimeout(resolve, 10));
				return { deleted: ids, failed: [] };
			});

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} batchSize={3} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnBulkDelete).toHaveBeenCalledTimes(2);
			});

			// Verify batches were called in order (3, then 3)
			expect(callOrder).toEqual([3, 3]);
		});
	});

	describe('Edge Cases', () => {
		it('should handle single item deletion', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1']);
			mockOnBulkDelete.mockResolvedValue({
				deleted: ['1'],
				failed: [],
			});

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockOnBulkDelete).toHaveBeenCalledWith(['1']);
			});

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Successfully deleted 1 book(s)', 'success');
			});
		});

		it('should handle empty selectedIds gracefully', () => {
			const selectedIds = new Set<string>();

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} open={true} />);

			// Dialog should still render with 0 items
			expect(screen.getByText('Delete 0 book(s)?')).toBeInTheDocument();
		});

		it('should handle errors without error message', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			mockOnBulkDelete.mockRejectedValue(new Error());

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('Failed to delete book(s)', 'error');
			});
		});

		it('should handle non-Error exceptions', async () => {
			const user = userEvent.setup();
			const selectedIds = new Set(['1', '2', '3']);
			mockOnBulkDelete.mockRejectedValue('string error');

			render(<BulkDeleteWorkflow {...defaultProps} selectedIds={selectedIds} open={true} />);

			await user.click(screen.getByRole('button', { name: 'Delete All' }));

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalledWith('string error', 'error');
			});
		});
	});
});
